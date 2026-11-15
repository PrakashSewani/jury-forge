// THROWAWAY SPIKE CODE - not part of the Jury Forge product.
import { normPath } from './util.mjs';

/** Strict: the whole response must be JSON. One outer code fence is tolerated, nothing else. */
export function parseModelText(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'empty response' };
  let body = text.trim();
  const fence = /^```(?:json)?\n([\s\S]*)\n```$/.exec(body);
  if (fence) body = fence[1].trim();
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${e.message}`.slice(0, 200) };
  }
}

function validateFinding(f, cfg, { chair }) {
  const errs = [];
  if (!f || typeof f !== 'object' || Array.isArray(f)) return ['not-an-object'];
  if (typeof f.file !== 'string' || !f.file.trim()) errs.push('file');
  if (!Number.isInteger(f.line) || f.line < 1) errs.push('line');
  if (!cfg.severities.includes(f.severity)) errs.push('severity');
  if (typeof f.category !== 'string' || !f.category.trim() || f.category.length > 80) errs.push('category');
  if (typeof f.claim !== 'string' || !f.claim.trim() || f.claim.length > 600) errs.push('claim');
  if (typeof f.evidence !== 'string' || !f.evidence.trim() || f.evidence.length > 600) errs.push('evidence');
  if (typeof f.confidence !== 'number' || f.confidence < 0 || f.confidence > 1) errs.push('confidence');
  if (chair && !(Array.isArray(f.sources) && f.sources.length > 0 && f.sources.every((s) => typeof s === 'string')))
    errs.push('sources');
  return errs;
}

/**
 * Response-level failure (bad JSON / bad top level) => ok:false, zero findings.
 * Finding-level failure => that finding is dropped and counted in `invalid`.
 */
export function validateResponse(value, cfg, { chair = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { ok: false, error: 'top level is not an object' };
  if (!Array.isArray(value.findings)) return { ok: false, error: '`findings` is not an array' };
  let dissent = [];
  if (chair) {
    if (!Array.isArray(value.dissent)) return { ok: false, error: '`dissent` is not an array' };
    dissent = value.dissent;
  }
  const findings = [];
  const invalid = [];
  value.findings.forEach((f, index) => {
    const errs = validateFinding(f, cfg, { chair });
    if (errs.length) invalid.push({ index, errors: errs });
    else findings.push({ ...f, file: normPath(f.file) });
  });
  return { ok: true, findings, invalid, dissent };
}
