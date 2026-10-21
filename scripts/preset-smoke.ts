/**
 * Gate for the VULCAN preset of @venizia/ignis: packs the workspace, creates an app from the PACKED
 * preset in a temp folder outside this repository and runs the app's own checks, so nothing passes
 * because of this repository's hoisted node_modules or a file the tarball dropped.
 * Usage: bun scripts/preset-smoke.ts   (needs a build: the packed tarballs ship dist)
 *
 *   VULCAN_CMD  how to run VULCAN (default `bun x @venizia/vulcan@latest`)
 *   VULCAN_TGZ  comma-separated packed VULCAN tarballs, installed in place of the registry copies
 *               while the version `init --preset` needs is not on npm
 *   SMOKE_DOCKER=1  also builds the app image from .configs/builders/Dockerfile and runs it (needs docker)
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const DEFAULT_VULCAN_CMD = 'bun x @venizia/vulcan@latest';
const PROJECT = 'demo';
const BACKEND_DIR = 'services';
const APP = 'core-api';
const DEV_PORT = '3000';
const HELLO_BODY = { message: 'Hello from IGNIS!' };
const SERVER_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;
const DOCKER = process.env.SMOKE_DOCKER === '1';
const TOTAL_STEPS = DOCKER ? 14 : 13;
const IMAGE = 'ignis-preset-smoke';
/** Planted in the app's .env before the image builds: it must never reach a layer. */
const PLANTED_SECRET = 'smoke-secret-must-not-leak';
/** Everything an app root may hold: the rest lives in .configs/ or src/. */
const APP_ROOT_ENTRIES = new Set([
  '.configs',
  '.env.example',
  'dist',
  'node_modules',
  'package.json',
  'src',
  'tsconfig.json',
]);
const VENDOR_DIR = 'vendor';
const LIB = 'billing';
const LIB_DIR = 'libs';
const LIB_SCRIPTS = ['clean', 'lint', 'lint:fix', 'test', 'typecheck'];
/** Exported while the app compiles; the stamp keeps 12 characters of a commit, so this is exactly 12. */
const STAMP_COMMIT = 'smokebuild01';
const BINARY = 'dist/bin';

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

/** Every path the preset's `urls` names must answer 200: VULCAN prints them as the pages to open. Served by the compiled binary. */
const assertHello = async (opts: { cwd: string; urls: string[] }): Promise<void> => {
  const port = await findFreePort();
  const server = Bun.spawn([join(opts.cwd, BINARY)], {
    cwd: opts.cwd,
    env: { ...process.env, PORT: String(port), APP_BUILD_COMMIT: '' },
    stdout: 'ignore',
    stderr: 'inherit',
  });

  try {
    const deadline = Date.now() + SERVER_TIMEOUT_MS;
    let body: unknown;

    while (Date.now() < deadline && body === undefined) {
      if (server.exitCode !== null) {
        throw new Error(`[preset-smoke] ${BINARY} exited early | Code: ${server.exitCode}`);
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

/** Files under a folder whose text holds a leftover `{{token}}`; node_modules and the compiled dist are not the app's. */
const findLeftoverTokens = (opts: { folder: string }): string[] => {
  const found: string[] = [];

  for (const entry of readdirSync(opts.folder, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
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
  const extra = readdirSync(opts.appDir).filter(entry => !APP_ROOT_ENTRIES.has(entry));
  if (extra.length > 0) {
    throw new Error(`[preset-smoke] the app root holds more than it may: ${extra.join(', ')}`);
  }

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

/** A lib is imported, never run: exports to src, ignis as a peer, and no app script. */
const assertLibrary = (opts: { libDir: string }): void => {
  const manifest = JSON.parse(readFileSync(join(opts.libDir, 'package.json'), 'utf8'));
  const scripts = Object.keys(manifest.scripts ?? {}).sort();
  const leftovers = findLeftoverTokens({ folder: opts.libDir });

  if (manifest.exports?.['.'] !== './src/index.ts') {
    throw new Error(
      `[preset-smoke] the lib exports ${JSON.stringify(manifest.exports)}, expected ./src/index.ts`,
    );
  }

  if (manifest.peerDependencies?.['@venizia/ignis'] === undefined) {
    throw new Error('[preset-smoke] the lib does not name @venizia/ignis as a peer');
  }

  if (JSON.stringify(scripts) !== JSON.stringify(LIB_SCRIPTS)) {
    throw new Error(
      `[preset-smoke] the lib scripts are ${scripts.join(', ')}, expected ${LIB_SCRIPTS.join(', ')}`,
    );
  }

  if (leftovers.length > 0) {
    throw new Error(`[preset-smoke] unreplaced {{ tokens in the lib: ${leftovers.join(', ')}`);
  }
};

/** Polls GET /api/hello on a port until it answers the hello body, or the deadline passes. */
const waitForHello = async (opts: { port: number }): Promise<unknown> => {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  let body: unknown;

  while (Date.now() < deadline && body === undefined) {
    body = await fetch(`http://127.0.0.1:${opts.port}/api/hello`).then(
      response => (response.ok ? response.json() : undefined),
      () => undefined,
    );

    if (body === undefined) {
      await Bun.sleep(POLL_INTERVAL_MS);
    }
  }

  return body;
};

/** A .dockerignore that lets .env files through: the image must refuse the context and name the fix. */
const assertLeakRefused = (opts: { projectDir: string; buildWithCommit: string[] }): void => {
  const ignoreFile = join(opts.projectDir, '.dockerignore');
  const dockerignore = readFileSync(ignoreFile, 'utf8');
  writeFileSync(
    ignoreFile,
    dockerignore
      .split('\n')
      .filter(line => !line.includes('.env'))
      .join('\n'),
  );
  const leaking = Bun.spawnSync({
    cmd: opts.buildWithCommit,
    cwd: opts.projectDir,
    stdout: 'ignore',
    stderr: 'pipe',
  });
  writeFileSync(ignoreFile, dockerignore);

  if (leaking.exitCode === 0 || !leaking.stderr.toString().includes('.dockerignore')) {
    throw new Error(
      '[preset-smoke] docker build accepted a context holding a .env file; it must refuse and name the .dockerignore',
    );
  }
};

/** The generated .dockerignore keeps the planted .env out of every layer, the builder's included. */
const assertBuilderClean = async (opts: {
  projectDir: string;
  dockerfile: string;
  buildArgs: string[];
}): Promise<void> => {
  const builder = `${IMAGE}-builder`;
  await run({
    command: [
      'docker',
      'build',
      '-q',
      '--target',
      'builder',
      '-f',
      opts.dockerfile,
      '-t',
      builder,
      ...opts.buildArgs,
    ],
    cwd: opts.projectDir,
  });
  const found = Bun.spawnSync({
    cmd: [
      'docker',
      'run',
      '--rm',
      builder,
      'sh',
      '-c',
      `grep -rl ${PLANTED_SECRET} /home/bun/project --exclude-dir=node_modules`,
    ],
    stdout: 'pipe',
    stderr: 'ignore',
  });
  Bun.spawnSync({ cmd: ['docker', 'rmi', '-f', builder], stdout: 'ignore', stderr: 'ignore' });

  if (found.exitCode === 0) {
    throw new Error(
      `[preset-smoke] the builder layer holds the planted secret: ${found.stdout.toString().trim()}`,
    );
  }
};

/**
 * The image from the app's .configs/builders/Dockerfile, built from the project root: refused when a
 * .env reaches the context or no commit is passed (the image has no .git), then built with one, its
 * builder layer free of the planted secret, carrying the commit in its OCI label and in the binary,
 * and answering /api/hello from a container.
 */
const assertDockerImage = async (opts: { projectDir: string }): Promise<void> => {
  const dockerfile = join(BACKEND_DIR, APP, '.configs', 'builders', 'Dockerfile');
  const build = ['docker', 'build', '-q', '-f', dockerfile, '-t', IMAGE];
  const buildArgs = [
    '--build-arg',
    `APP_BUILD_COMMIT=${STAMP_COMMIT}`,
    '--build-arg',
    'APP_BUILD_BRANCH=smoke',
    '.',
  ];
  writeFileSync(
    join(opts.projectDir, BACKEND_DIR, APP, '.env'),
    `APP_ENV_SMOKE_SECRET=${PLANTED_SECRET}\n`,
  );
  assertLeakRefused({ projectDir: opts.projectDir, buildWithCommit: [...build, ...buildArgs] });

  const refused = Bun.spawnSync({
    cmd: [...build, '.'],
    cwd: opts.projectDir,
    stdout: 'ignore',
    stderr: 'ignore',
  });

  if (refused.exitCode === 0) {
    throw new Error('[preset-smoke] docker build passed without APP_BUILD_COMMIT; it must refuse');
  }

  await run({ command: [...build, ...buildArgs], cwd: opts.projectDir });
  await assertBuilderClean({ projectDir: opts.projectDir, dockerfile, buildArgs });
  const port = await findFreePort();

  try {
    const label = await run({
      command: [
        'docker',
        'inspect',
        '--format',
        '{{ index .Config.Labels "org.opencontainers.image.revision" }}',
        IMAGE,
      ],
      cwd: opts.projectDir,
    });

    if (label.trim() !== STAMP_COMMIT) {
      throw new Error(
        `[preset-smoke] the image label holds ${JSON.stringify(label.trim())}, expected ${STAMP_COMMIT}`,
      );
    }

    await run({
      command: [
        'docker',
        'run',
        '--rm',
        '--entrypoint',
        'grep',
        IMAGE,
        '-c',
        STAMP_COMMIT,
        './bin',
      ],
      cwd: opts.projectDir,
    });
    await run({
      command: [
        'docker',
        'run',
        '-d',
        '--name',
        IMAGE,
        '-p',
        `127.0.0.1:${port}:${DEV_PORT}`,
        IMAGE,
      ],
      cwd: opts.projectDir,
    });
    const body = await waitForHello({ port });

    if (JSON.stringify(body) !== JSON.stringify(HELLO_BODY)) {
      throw new Error(
        `[preset-smoke] the container answered ${JSON.stringify(body)} | Expected: ${JSON.stringify(HELLO_BODY)}`,
      );
    }
  } finally {
    Bun.spawnSync({ cmd: ['docker', 'rm', '-f', IMAGE], stdout: 'ignore', stderr: 'ignore' });
    Bun.spawnSync({ cmd: ['docker', 'rmi', '-f', IMAGE], stdout: 'ignore', stderr: 'ignore' });
  }
};

/** The compile bakes the stamp into the bundle as text, so the binary carries the commit it was built from. */
const assertStampBaked = (opts: { binary: string }): void => {
  if (!readFileSync(opts.binary).includes(STAMP_COMMIT)) {
    throw new Error(`[preset-smoke] ${BINARY} does not carry the stamp commit ${STAMP_COMMIT}`);
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

  step({
    label: 'point every @venizia/* package at its packed tarball, vendored inside the project',
  });
  // Inside the project, with relative paths, so a docker build of the project sees them too.
  const vendorDir = join(projectDir, VENDOR_DIR);
  mkdirSync(vendorDir);
  const vendor = (opts: { tarball: string }): string => {
    const target = join(vendorDir, basename(opts.tarball));
    copyFileSync(opts.tarball, target);
    return `file:./${VENDOR_DIR}/${basename(opts.tarball)}`;
  };
  const overrides = Object.fromEntries(
    [...tarballs].map(([name, tarball]) => [name, vendor({ tarball })]),
  );

  for (const tarball of (process.env.VULCAN_TGZ ?? '').split(',').filter(Boolean)) {
    overrides[await readTarballName({ tarball, cwd: opts.scratch })] = vendor({
      tarball: resolve(tarball),
    });
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

  step({ label: 'the app: compile, and the build stamp is baked into the binary' });
  await run({
    command: ['bun', 'run', 'compile'],
    cwd: appDir,
    env: { APP_BUILD_COMMIT: STAMP_COMMIT },
  });
  assertStampBaked({ binary: join(appDir, BINARY) });

  step({ label: 'the project: vulcan doctor, okf check' });
  await run({ command: ['bun', 'x', 'vulcan', 'doctor'], cwd: projectDir });
  await run({ command: ['bun', 'x', 'vulcan', 'x', 'okf', 'check', '--strict'], cwd: projectDir });

  step({ label: 'the scaffold: renamed dotfile, dev port, no leftover tokens' });
  assertScaffold({ appDir });

  step({ label: 'the app answers GET /api/hello and every preset url' });
  const preset = await Bun.file(
    join(presetDir, 'package', 'dist', 'vulcan-preset', 'app', 'preset.json'),
  ).json();
  if (!Array.isArray(preset.urls) || preset.urls.length === 0) {
    throw new Error('[preset-smoke] the packed preset names no urls');
  }
  await assertHello({ cwd: appDir, urls: preset.urls });

  step({ label: 'the app: clean removes dist' });
  await run({ command: ['bun', 'run', 'clean'], cwd: appDir });
  if (existsSync(join(appDir, 'dist'))) {
    throw new Error('[preset-smoke] `clean` left dist behind');
  }

  step({ label: 'vulcan add --lib (from the packed preset): install, sync and its checks' });
  await run({
    command: [
      'bun',
      'x',
      'vulcan',
      'add',
      '--preset',
      `file:${join(presetDir, 'package')}`,
      '--lib',
      LIB,
      '--dir',
      LIB_DIR,
    ],
    cwd: projectDir,
  });

  step({ label: 'the lib: typecheck, lint, test, and a library package.json' });
  const libDir = join(projectDir, LIB_DIR, LIB);
  for (const check of ['typecheck', 'lint', 'test']) {
    await run({ command: ['bun', 'run', check], cwd: libDir });
  }
  assertLibrary({ libDir });

  if (DOCKER) {
    step({
      label: 'the app image: refused without a commit, then built, labelled, serving /api/hello',
    });
    await assertDockerImage({ projectDir });
  }
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
