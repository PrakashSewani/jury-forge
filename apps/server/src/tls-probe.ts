// Has Caddy issued the origin's certificate? (first-run-setup Stage 1.5 step 4.) The app opens a
// TLS connection to Caddy over the internal network, with the origin as SNI, and verifies the
// chain against the public roots Node trusts and the name against the origin. It needs no
// hairpinning and no egress (owner decision, 2026-11-28). The handshake also starts on-demand
// issuance, which Caddy gates on the `ask` endpoint.

import { connect } from 'node:tls';

export interface TlsTarget {
  host: string;
  port: number;
}

/** Caddy's HTTPS listener as the bundled Compose file names it. */
export const CADDY_TLS_TARGET: TlsTarget = { host: 'caddy', port: 443 };

export type TlsProbeResult =
  | { issued: true; issuer: string; validTo: string }
  | { issued: false; reason: string };

export type TlsProbe = (servername: string) => Promise<TlsProbeResult>;

export function createTlsProbe(target: TlsTarget = CADDY_TLS_TARGET, timeoutMs = 5000): TlsProbe {
  return (servername) =>
    new Promise<TlsProbeResult>((resolve) => {
      const socket = connect({
        host: target.host,
        port: target.port,
        servername,
        rejectUnauthorized: true,
        ALPNProtocols: ['http/1.1'],
        timeout: timeoutMs,
      });
      const finish = (result: TlsProbeResult) => {
        socket.destroy();
        resolve(result);
      };
      socket.once('secureConnect', () => {
        const certificate = socket.getPeerCertificate();
        const issuer = certificate.issuer?.O ?? certificate.issuer?.CN ?? 'unknown';
        finish({ issued: true, issuer: String(issuer), validTo: certificate.valid_to });
      });
      socket.once('timeout', () => finish({ issued: false, reason: 'timeout' }));
      socket.once('error', (error: NodeJS.ErrnoException) =>
        finish({ issued: false, reason: error.code ?? error.message }),
      );
    });
}
