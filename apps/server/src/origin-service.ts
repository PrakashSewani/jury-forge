// The effective origin and its TLS state, for the `ask` endpoint, `Host` pinning, and `/readyz`
// (ADR-0021, ADR-0036). Precedence: `PUBLIC_URL` (frozen) over the stored origin; no origin means
// the instance is unconfigured. The TLS mode is always the stored one (`caddy` until chosen).
// Reads are cached briefly; the process that writes the setting calls `invalidate()`.

import {
  createTokenBucket,
  type Origin,
  parseOrigin,
  type TlsMode,
  type TokenBucket,
  takeToken,
} from '@jury-forge/domain';
import { readOriginSetting, type Store } from '@jury-forge/store';
import type { TlsProbe, TlsProbeResult } from './tls-probe.ts';

export interface OriginState {
  origin: Origin | null;
  /** True when `PUBLIC_URL` sets the origin; setup then shows it read-only. */
  frozen: boolean;
  tlsMode: TlsMode;
}

/**
 * What `/readyz` and setup report (first-run-setup Stage 1.5). `tls_front` needs the ADR-0036
 * proof (a verified webhook delivery and `insecure_ssl` = 0), which arrives with the GitHub App
 * (WP 1-16); until then `front` stays `tls_front_unverified`.
 */
export type OriginReadiness =
  | { state: 'origin_unset'; frozen: false; tls_mode: TlsMode }
  | { state: 'tls_pending'; frozen: boolean; tls_mode: 'caddy'; reason: string }
  | { state: 'tls_issued'; frozen: boolean; tls_mode: 'caddy'; issuer: string; valid_to: string }
  | { state: 'tls_front_unverified'; frozen: boolean; tls_mode: 'front' };

export type AskDecision = 'allow' | 'not_configured' | 'other_name' | 'front_mode' | 'rate_limited';

export interface OriginServiceOptions {
  store: Store;
  /** The parsed `PUBLIC_URL`, or null. */
  publicUrl: Origin | null;
  probe: TlsProbe;
  now?: () => number;
  /** How long a read of the stored setting is reused. Defaults to 5 s. */
  settingTtlMs?: number;
  /** How long a probe result is reused: pending defaults to 30 s, issued to 10 min. */
  pendingTtlMs?: number;
  issuedTtlMs?: number;
}

/** ADR-0021's issuance limit, kept by the app now that Caddy 2.11 has no `interval`/`burst`. */
export const ASK_BURST = 5;
export const ASK_PERIOD_MS = 2 * 60_000;

export class OriginService {
  readonly #store: Store;
  readonly #publicUrl: Origin | null;
  readonly #probe: TlsProbe;
  readonly #now: () => number;
  readonly #settingTtlMs: number;
  readonly #pendingTtlMs: number;
  readonly #issuedTtlMs: number;
  #setting: { state: OriginState; at: number } | null = null;
  #tls: { host: string; result: TlsProbeResult; at: number } | null = null;
  #bucket: TokenBucket;

  constructor(options: OriginServiceOptions) {
    this.#store = options.store;
    this.#publicUrl = options.publicUrl;
    this.#probe = options.probe;
    this.#now = options.now ?? Date.now;
    this.#settingTtlMs = options.settingTtlMs ?? 5000;
    this.#pendingTtlMs = options.pendingTtlMs ?? 30_000;
    this.#issuedTtlMs = options.issuedTtlMs ?? 10 * 60_000;
    this.#bucket = createTokenBucket(ASK_BURST, ASK_PERIOD_MS, this.#now());
  }

  /** Throws when the setting cannot be read; callers fail closed. */
  async current(): Promise<OriginState> {
    const now = this.#now();
    if (this.#setting !== null && now - this.#setting.at < this.#settingTtlMs) {
      return this.#setting.state;
    }
    const stored = await readOriginSetting(this.#store);
    let origin = this.#publicUrl;
    if (origin === null && stored?.url != null) {
      const parsed = parseOrigin(stored.url);
      // readOriginSetting already refuses a non-canonical row.
      origin = parsed.ok ? parsed.origin : null;
    }
    const state: OriginState = {
      origin,
      frozen: this.#publicUrl !== null,
      tlsMode: stored?.tlsMode ?? 'caddy',
    };
    this.#setting = { state, at: now };
    return state;
  }

  invalidate(): void {
    this.#setting = null;
    this.#tls = null;
  }

  /**
   * Caddy's `ask`: may it obtain a certificate for `domain`? Only for the configured origin, only
   * in `caddy` mode, and at most ASK_BURST approvals per ASK_PERIOD_MS.
   */
  async ask(domain: string): Promise<AskDecision> {
    const { origin, tlsMode } = await this.current();
    if (origin === null) return 'not_configured';
    if (domain.trim().toLowerCase().replace(/\.$/, '') !== origin.host) return 'other_name';
    if (tlsMode !== 'caddy') return 'front_mode';
    const { taken, bucket } = takeToken(this.#bucket, this.#now());
    this.#bucket = bucket;
    return taken ? 'allow' : 'rate_limited';
  }

  async readiness(): Promise<OriginReadiness> {
    const { origin, frozen, tlsMode } = await this.current();
    if (origin === null) return { state: 'origin_unset', frozen: false, tls_mode: tlsMode };
    if (tlsMode === 'front') return { state: 'tls_front_unverified', frozen, tls_mode: 'front' };
    const result = await this.#tlsResult(origin.host);
    return result.issued
      ? {
          state: 'tls_issued',
          frozen,
          tls_mode: 'caddy',
          issuer: result.issuer,
          valid_to: result.validTo,
        }
      : { state: 'tls_pending', frozen, tls_mode: 'caddy', reason: result.reason };
  }

  async #tlsResult(host: string): Promise<TlsProbeResult> {
    const now = this.#now();
    const cached = this.#tls;
    if (cached !== null && cached.host === host) {
      const ttl = cached.result.issued ? this.#issuedTtlMs : this.#pendingTtlMs;
      if (now - cached.at < ttl) return cached.result;
    }
    const result = await this.#probe(host);
    this.#tls = { host, result, at: now };
    return result;
  }
}
