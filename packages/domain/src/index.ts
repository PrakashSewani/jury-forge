// Pure decision logic: fingerprint, anchor, chair, risk, budget, policy, JCS. No I/O.
// M1.1: canonical JSON (step input hashes) and the step retry policy (WP 1-11).
export { CanonicalJsonError, canonicalJson } from './canonical-json.ts';
export {
  decideFailure,
  type FailureDecision,
  type FailureInput,
  type FailureKind,
  StepFailure,
} from './retry-policy.ts';
