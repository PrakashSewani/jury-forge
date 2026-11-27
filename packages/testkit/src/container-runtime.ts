import { getContainerRuntimeClient } from 'testcontainers';

/** True when testcontainers can reach a Docker-compatible runtime. */
export async function containerRuntimeAvailable(): Promise<boolean> {
  try {
    await getContainerRuntimeClient();
    return true;
  } catch {
    return false;
  }
}

/**
 * Decides whether integration tests run.
 *
 * In CI (`CI` is set) a missing runtime is a failure, never a silent skip: the integration stage
 * is a required check. Locally it returns false and warns, so a contributor without Docker can
 * still run the rest of `pnpm check`.
 */
export async function requireContainerRuntime(): Promise<boolean> {
  if (await containerRuntimeAvailable()) {
    return true;
  }
  if (process.env['CI']) {
    throw new Error('Integration tests need a container runtime, and none was found in CI.');
  }
  // Written straight to stderr: Vitest hides console output from files whose tests all skip.
  process.stderr.write(
    '\n[testkit] No container runtime found: integration tests are SKIPPED locally. ' +
      'Start Docker to run them; CI always runs them.\n\n',
  );
  return false;
}
