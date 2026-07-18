import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Bun.build resolves literal dynamic-import specifiers at bundle time - and `minify.syntax` folds
 * const-held specifiers back to literals - so optional peers must stay invisible or consumers are
 * forced to install/externalize them. Probes bundle in subprocesses: in-process Bun.build under `bun test` reports spurious errors for modules other test files already loaded.
 */
// winston joined the optional peers with single-provider loading (2026-07-18): the factory's lazy
// default sits behind a createRequire boundary, so bundling the root barrel must not resolve it.
const OPTIONAL_PEER_FILTER = String.raw`/^(node-vault|@dotenvx\/dotenvx|winston|winston-transport|winston-daily-rotate-file)$/`;

interface IProbeReport {
  success: boolean;
  errors: Array<string>;
  resolutionAttempts?: Array<string>;
}

let probeDirectory: string;

const buildProbeScript = (opts: { entryPath: string; outdirName: string; withSpy?: boolean }) => {
  const spyPlugin = `
    plugins: [
      {
        name: 'optional-peer-resolution-spy',
        setup: builder => {
          builder.onResolve({ filter: ${OPTIONAL_PEER_FILTER} }, args => {
            resolutionAttempts.push(args.path);
            return { path: args.path, external: true };
          });
        },
      },
    ],`;
  return `
    const resolutionAttempts = [];
    const result = await Bun.build({
      entrypoints: [${JSON.stringify(opts.entryPath)}],
      target: 'bun',
      minify: { whitespace: true, syntax: true, identifiers: false },
      outdir: ${JSON.stringify(path.join(probeDirectory, opts.outdirName))},
      throw: false,${opts.withSpy ? spyPlugin : ''}
    });
    const errors = result.logs.filter(log => log.level === 'error').map(String);
    console.log('PROBE_REPORT:' + JSON.stringify({
      success: result.success,
      errors,
      ...(${Boolean(opts.withSpy)} ? { resolutionAttempts } : {}),
    }));
  `;
};

const runProbe = async (opts: { name: string; script: string }): Promise<IProbeReport> => {
  const scriptPath = path.join(probeDirectory, `${opts.name}.ts`);
  await writeFile(scriptPath, opts.script);
  const result = Bun.spawnSync({
    cmd: ['bun', scriptPath],
    cwd: probeDirectory,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = result.stdout.toString();
  const marker = stdout.split('\n').find(line => line.startsWith('PROBE_REPORT:'));
  if (!marker) {
    throw new Error(
      `[no-bundler-peer-resolution] probe emitted no report | stdout: ${stdout} | stderr: ${result.stderr.toString()}`,
    );
  }
  return JSON.parse(marker.slice('PROBE_REPORT:'.length)) as IProbeReport;
};

beforeAll(async () => {
  probeDirectory = await mkdtemp(path.join(tmpdir(), 'ignis-bundler-probe-'));
});

afterAll(async () => {
  await rm(probeDirectory, { recursive: true, force: true });
});

describe('secrets peers stay invisible to Bun.build', () => {
  test('importOptionalModule keeps an unresolvable specifier bundleable under minify.syntax', async () => {
    const utilityPath = path.resolve(process.cwd(), 'src/utilities/module.utility.ts');
    const entryPath = path.join(probeDirectory, 'import-optional-entry.ts');
    await writeFile(
      entryPath,
      `import { importOptionalModule } from ${JSON.stringify(utilityPath)};\n` +
        `export const load = () => importOptionalModule({ module: '@venizia/__not-installed-probe__' });\n`,
    );

    const report = await runProbe({
      name: 'import-optional-probe',
      script: buildProbeScript({ entryPath, outdirName: 'out-utility' }),
    });

    expect(report.errors).toEqual([]);
    expect(report.success).toBe(true);
  });

  test('bundling the root barrel never attempts to resolve node-vault or @dotenvx/dotenvx', async () => {
    const barrelPath = path.resolve(process.cwd(), 'src/index.ts');
    const entryPath = path.join(probeDirectory, 'root-barrel-entry.ts');
    await writeFile(entryPath, `export * from ${JSON.stringify(barrelPath)};\n`);

    const report = await runProbe({
      name: 'root-barrel-probe',
      script: buildProbeScript({ entryPath, outdirName: 'out-barrel', withSpy: true }),
    });

    expect(report.errors).toEqual([]);
    expect(report.success).toBe(true);
    expect(report.resolutionAttempts).toEqual([]);
  });

  test('positive control: a literal peer import IS seen by the resolution spy', async () => {
    const entryPath = path.join(probeDirectory, 'literal-peer-entry.ts');
    await writeFile(entryPath, `export const load = () => import('node-vault');\n`);

    const report = await runProbe({
      name: 'literal-peer-probe',
      script: buildProbeScript({ entryPath, outdirName: 'out-literal', withSpy: true }),
    });

    expect(report.resolutionAttempts).toEqual(['node-vault']);
  });
});
