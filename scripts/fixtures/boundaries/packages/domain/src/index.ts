// Allowed: domain → contracts.
import '../../contracts/src/index.ts';
// Violation: domain-imports-only-contracts.
import '../../store/src/index.ts';
// Violation: domain-no-io.
import 'node:fs';
