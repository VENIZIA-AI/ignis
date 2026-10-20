/**
 * Gate for the VULCAN preset of @venizia/ignis: packs the workspace, creates an app from the PACKED
 * preset in a temp folder outside this repository and runs the app's own checks, so nothing passes
 * because of this repository's hoisted node_modules or a file the tarball dropped.
 * Usage: bun scripts/preset-smoke.ts   (needs a build: the packed tarballs ship dist)
 *
 *   VULCAN_CMD  how to run VULCAN (default `bun x @venizia/vulcan@latest`)
 *   VULCAN_TGZ  comma-separated packed VULCAN tarballs, installed in place of the registry copies
 *               while the version `init --preset` needs is not on npm
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DEFAULT_VULCAN_CMD = 'bun x @venizia/vulcan@latest';
const PROJECT = 'demo';
const BACKEND_DIR = 'services';
const APP = 'core-api';
const DEV_PORT = '3000';
const HELLO_BODY = { message: 'Hello from IGNIS!' };
const SERVER_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;
const TOTAL_STEPS = 9;

let stepNumber = 0;

const step = (opts: { label: string }): void => {
  stepNumber += 1;
  console.log(`[preset-smoke ${stepNumber}/${TOTAL_STEPS}] ${opts.label}`);
};

/** Runs one command and returns its stdout; a non-zero exit throws with the command and its output. */
const run = async (opts: {
  command: string[];
  cwd: string;
  env?: Record<string, string>;
}): Promise<string> => {
  const child = Bun.spawn(opts.command, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (code !== 0) {
    throw new Error(
      `[preset-smoke] \`${opts.command.join(' ')}\` exited ${code} | Cwd: ${opts.cwd}\n${stdout}\n${stderr}`,
    );
  }

  return stdout;
};

const readTarballName = async (opts: { tarball: string; cwd: string }): Promise<string> => {
  const manifest = await run({
    command: ['tar', '-xzOf', opts.tarball, 'package/package.json'],
    cwd: opts.cwd,
  });
  const { name } = JSON.parse(manifest);

  return name;
};

/** Every publishable workspace package, packed; package name to tarball path. */
const packWorkspace = async (opts: {
  root: string;
  destination: string;
}): Promise<Map<string, string>> => {
  const tarballs = new Map<string, string>();
  const packagesDir = join(opts.root, 'packages');

  for (const folder of readdirSync(packagesDir).sort()) {
    const cwd = join(packagesDir, folder);
    const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));

    if (manifest.private === true) {
      continue;
    }

    const output = await run({
      command: ['bun', 'pm', 'pack', '--quiet', '--destination', opts.destination],
      cwd,
    });
    const tarball = output.trim().split('\n').pop() ?? '';

    tarballs.set(manifest.name, tarball);
  }

  return tarballs;
};

const findFreePort = async (): Promise<number> => {
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  const { port } = probe;
  await probe.stop(true);

  if (port === undefined) {
    throw new Error('[preset-smoke] the probe server has no port');
  }

  return port;
};

/** Every path the preset's `urls` names must answer 200: VULCAN prints them as the pages to open. */
const assertHello = async (opts: { cwd: string; urls: string[] }): Promise<void> => {
  const port = await findFreePort();
  const server = Bun.spawn(['bun', 'run', 'src/index.ts'], {
    cwd: opts.cwd,
    env: { ...process.env, PORT: String(port) },
    stdout: 'ignore',
    stderr: 'inherit',
  });

  try {
    const deadline = Date.now() + SERVER_TIMEOUT_MS;
    let body: unknown;

    while (Date.now() < deadline && body === undefined) {
      if (server.exitCode !== null) {
        throw new Error(`[preset-smoke] src/index.ts exited early | Code: ${server.exitCode}`);
      }

      body = await fetch(`http://127.0.0.1:${port}/api/hello`).then(
        response => (response.ok ? response.json() : undefined),
        () => undefined,
      );

      if (body === undefined) {
        await Bun.sleep(POLL_INTERVAL_MS);
      }
    }

    if (JSON.stringify(body) !== JSON.stringify(HELLO_BODY)) {
      throw new Error(
        `[preset-smoke] GET /api/hello answered ${JSON.stringify(body)} | Expected: ${JSON.stringify(HELLO_BODY)}`,
      );
    }

    for (const url of opts.urls) {
      const response = await fetch(`http://127.0.0.1:${port}${url}`);

      if (response.status !== 200) {
        throw new Error(
          `[preset-smoke] preset url ${url} answered ${response.status} | Expected: 200`,
        );
      }
    }
  } finally {
    server.kill();
    await server.exited;
  }
};

/** Files under a folder whose text holds a leftover `{{token}}`; node_modules is not the app's. */
const findLeftoverTokens = (opts: { folder: string }): string[] => {
  const found: string[] = [];

  for (const entry of readdirSync(opts.folder, { withFileTypes: true })) {
    if (entry.name === 'node_modules') {
      continue;
    }

    const path = join(opts.folder, entry.name);

    if (entry.isDirectory()) {
      found.push(...findLeftoverTokens({ folder: path }));
    } else if (readFileSync(path, 'utf8').includes('{{')) {
      found.push(path);
    }
  }

  return found;
};

const assertScaffold = (opts: { appDir: string }): void => {
  const hasUnrenamed = readdirSync(opts.appDir).includes('_env.example');
  const example = readFileSync(join(opts.appDir, '.env.example'), 'utf8');
  const application = readFileSync(join(opts.appDir, 'src/application.ts'), 'utf8');
  const leftovers = findLeftoverTokens({ folder: opts.appDir });

  if (hasUnrenamed) {
    throw new Error('[preset-smoke] _env.example was not renamed to .env.example');
  }

  if (example.trim() !== `PORT=${DEV_PORT}`) {
    throw new Error(
      `[preset-smoke] .env.example holds ${JSON.stringify(example)}, expected PORT=${DEV_PORT}`,
    );
  }

  if (!application.includes(`?? '${DEV_PORT}'`)) {
    throw new Error(`[preset-smoke] src/application.ts did not get the dev port ${DEV_PORT}`);
  }

  if (leftovers.length > 0) {
    throw new Error(`[preset-smoke] unreplaced {{ tokens in: ${leftovers.join(', ')}`);
  }
};

const smoke = async (opts: { root: string; scratch: string }): Promise<void> => {
  const vulcan = (process.env.VULCAN_CMD ?? DEFAULT_VULCAN_CMD).split(/\s+/).filter(Boolean);
  const tarballDir = join(opts.scratch, 'tgz');
  const presetDir = join(opts.scratch, 'preset');
  const workDir = join(opts.scratch, 'work');
  const projectDir = join(workDir, PROJECT);
  const appDir = join(projectDir, BACKEND_DIR, APP);

  mkdirSync(tarballDir);
  mkdirSync(presetDir);
  mkdirSync(workDir);

  step({ label: 'build the preset and pack every publishable package' });
  await run({ command: ['make', 'preset-build'], cwd: opts.root });
  const tarballs = await packWorkspace({ root: opts.root, destination: tarballDir });
  const ignisTarball = tarballs.get('@venizia/ignis');

  if (ignisTarball === undefined) {
    throw new Error('[preset-smoke] packages/core-server did not pack as @venizia/ignis');
  }

  step({ label: 'extract the preset from the @venizia/ignis tarball' });
  await run({ command: ['tar', '-xzf', ignisTarball, '-C', presetDir], cwd: opts.scratch });

  step({ label: 'vulcan init --preset (from the packed preset)' });
  await run({
    command: [
      ...vulcan,
      'init',
      '--preset',
      `file:${join(presetDir, 'package')}`,
      '--project',
      PROJECT,
      '--backend-dir',
      BACKEND_DIR,
      '--app',
      APP,
    ],
    cwd: workDir,
    env: { VULCAN_NO_INSTALL: '1' },
  });

  step({ label: 'point every @venizia/* package at its packed tarball' });
  const overrides = Object.fromEntries(
    [...tarballs].map(([name, tarball]) => [name, `file:${tarball}`]),
  );

  for (const tarball of (process.env.VULCAN_TGZ ?? '').split(',').filter(Boolean)) {
    overrides[await readTarballName({ tarball, cwd: opts.scratch })] = `file:${resolve(tarball)}`;
  }

  const manifestFile = join(projectDir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));

  writeFileSync(manifestFile, `${JSON.stringify({ ...manifest, overrides }, null, 2)}\n`);

  step({ label: 'bun install, vulcan sync' });
  await run({ command: ['git', 'init', '-q', '-b', 'develop'], cwd: projectDir });
  await run({ command: ['bun', 'install'], cwd: projectDir });
  await run({ command: ['bun', 'x', 'vulcan', 'sync'], cwd: projectDir });

  step({ label: 'the app: typecheck, lint, test' });
  for (const check of ['typecheck', 'lint', 'test']) {
    await run({ command: ['bun', 'run', check], cwd: appDir });
  }

  step({ label: 'the project: vulcan doctor, okf check' });
  await run({ command: ['bun', 'x', 'vulcan', 'doctor'], cwd: projectDir });
  await run({ command: ['bun', 'x', 'vulcan', 'x', 'okf', 'check', '--strict'], cwd: projectDir });

  step({ label: 'the scaffold: renamed dotfile, dev port, no leftover tokens' });
  assertScaffold({ appDir });

  step({ label: 'the app answers GET /api/hello and every preset url' });
  const preset = await Bun.file(
    join(presetDir, 'package', 'dist', 'vulcan-preset', 'preset.json'),
  ).json();
  if (!Array.isArray(preset.urls) || preset.urls.length === 0) {
    throw new Error('[preset-smoke] the packed preset names no urls');
  }
  await assertHello({ cwd: appDir, urls: preset.urls });
};

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..');
  const scratch = mkdtempSync(join(tmpdir(), 'ignis-preset-smoke-'));

  try {
    await smoke({ root, scratch });
    rmSync(scratch, { recursive: true, force: true });
    console.log('preset smoke OK');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(`[preset-smoke] kept for inspection: ${scratch}`);
    process.exit(1);
  }
}
