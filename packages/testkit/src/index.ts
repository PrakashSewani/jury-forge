// Test-only helpers. Production code must never import this package (.dependency-cruiser.cjs).
export { containerRuntimeAvailable, requireContainerRuntime } from './container-runtime.ts';
export { POSTGRES_IMAGE, startPostgres } from './postgres.ts';
