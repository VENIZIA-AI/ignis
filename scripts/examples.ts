/**
 * The example gates. The examples are templates that carry their own package.json scripts, so make
 * does not drive them: CI and the pre-commit hook call this script next to `make lint-all`.
 *
 *   bun scripts/examples.ts check       artifacts, lint and typecheck - the pre-commit and CI gate
 *   bun scripts/examples.ts lint        artifacts, then every example's `lint` script
 *   bun scripts/examples.ts typecheck   every example's `typecheck` script
 *   bun scripts/examples.ts artifacts   examples/vert's generated artifact index is fresh
 *   bun scripts/examples.ts smoke       the smoke test of every example in SMOKE_EXAMPLES
 */

/**
 * Examples whose smoke test needs no external service - each boots the real app and calls its
 * endpoints. Examples that need Postgres, Typesense or Redis run theirs locally with docker.
 */
const SMOKE_EXAMPLES = [
  'pglite-quickstart',
  'sqlite-quickstart',
  '5-mins-qs',
  'browser-bff',
  'grpc-test',
  'rpc-api-server',
];

/** Runs one command with the terminal attached; resolves to its exit code. */
const run = async (opts: { command: string[]; cwd?: string }): Promise<number> => {
  const proc = Bun.spawn(opts.command, { cwd: opts.cwd, stdout: 'inherit', stderr: 'inherit' });
  return proc.exited;
};

// The generated artifact index must match the decorated classes on disk; a stale index registers
// yesterday's classes and passes every other gate.
const artifacts = async (): Promise<number> => {
  console.log('🔍 Checking generated artifact indexes...');
  return run({ command: ['bun', 'run', '--filter', './examples/vert', 'check:artifacts'] });
};

const lint = async (): Promise<number> => {
  console.log('🔍 Linting all examples...');
  return run({ command: ['bun', 'run', '--filter', './examples/*', 'lint'] });
};

// oxlint and bun fmt do not typecheck, and no example is in `make build-all` - a codemod once left an
// example that could not compile and every gate stayed green.
const typecheck = async (): Promise<number> => {
  console.log('🔍 Typechecking all examples...');
  return run({ command: ['bun', 'run', '--filter', './examples/*', 'typecheck'] });
};

/** Runs every example, one after another (each binds a port), and fails if any one failed. Needs a build. */
const smoke = async (): Promise<number> => {
  console.log(`🔍 Smoke-testing examples: ${SMOKE_EXAMPLES.join(' ')}`);
  let failed = 0;
  for (const example of SMOKE_EXAMPLES) {
    const code = await run({ command: ['bun', 'run', 'test'], cwd: `examples/${example}` });
    if (code !== 0) {
      failed = 1;
    }
  }
  return failed;
};

/** Runs each step in order and stops at the first that fails. */
const series = async (steps: Array<() => Promise<number>>): Promise<number> => {
  for (const step of steps) {
    const code = await step();
    if (code !== 0) {
      return code;
    }
  }
  return 0;
};

const COMMANDS: Record<string, () => Promise<number>> = {
  check: () => series([artifacts, lint, typecheck]),
  lint: () => series([artifacts, lint]),
  typecheck,
  artifacts,
  smoke,
};

const [command] = process.argv.slice(2);
const handler = command ? COMMANDS[command] : undefined;

if (!handler) {
  console.error(`usage: bun scripts/examples.ts <${Object.keys(COMMANDS).join('|')}>`);
  process.exit(command === '--help' ? 0 : 2);
}

handler().then(
  code => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
