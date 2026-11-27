// Import boundaries for the workspace (technical-approach.md §4, WP 1-02).
// "Code decides": the rules that decide outcomes live in `domain` and stay pure, so `domain`
// imports only `contracts`, and nothing outside tests imports `testkit`.

const IMPLEMENTATIONS = 'packages/(gateway|forge|store|crypto)/';
const IO_MODULES =
  '^(node:)?(fs|fs/promises|net|http|https|http2|dgram|dns|dns/promises|tls|child_process|cluster|worker_threads|readline|repl|vm|inspector)$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-imports-only-contracts',
      comment: 'domain is pure logic: it may import contracts and nothing else from the workspace.',
      severity: 'error',
      from: { path: '^packages/domain/' },
      to: { path: '^(apps|packages)/', pathNot: '^packages/(domain|contracts)/' },
    },
    {
      name: 'domain-no-io',
      comment: 'domain does no I/O: no file system, network, process, or worker modules.',
      severity: 'error',
      from: { path: '^packages/domain/' },
      to: { dependencyTypes: ['core'], path: IO_MODULES },
    },
    {
      name: 'contracts-imports-nothing-internal',
      comment: 'contracts is the leaf: schemas and types with no workspace dependencies.',
      severity: 'error',
      from: { path: '^packages/contracts/' },
      to: { path: '^(apps|packages)/', pathNot: '^packages/contracts/' },
    },
    {
      name: 'pipeline-uses-ports-not-implementations',
      comment: 'pipeline depends on domain and ports; apps wire in gateway/forge/store/crypto.',
      severity: 'error',
      from: { path: '^packages/pipeline/' },
      to: { path: `^${IMPLEMENTATIONS}` },
    },
    {
      name: 'packages-do-not-import-apps',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'apps-do-not-import-each-other',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'testkit-only-in-tests',
      comment: 'testkit (stub provider, containers, fixtures) never ships in production code.',
      severity: 'error',
      from: { path: '^(apps|packages)/', pathNot: ['\\.test\\.ts$', '^packages/testkit/'] },
      to: { path: '^packages/testkit/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-undeclared-dependency',
      comment: 'Every imported package, including workspace packages, is declared in package.json.',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // scripts/fixtures holds deliberate violations for scripts/dependency-rules.test.ts.
    exclude: { path: ['(^|/)(dist|coverage)/', '^scripts/fixtures/'] },
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
