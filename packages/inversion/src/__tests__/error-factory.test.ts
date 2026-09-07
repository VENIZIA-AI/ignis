import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isApplicationError, MessageCode } from '../index';

/** `MessageCode.build` must throw `ApplicationError`, not the module-private fallback `Error` -
 * the shape a bundler silently keeps only when the registration lives in the package entry. */
const expectApplicationError = (fn: () => unknown, pattern: RegExp): void => {
  try {
    fn();
  } catch (error) {
    if (!isApplicationError(error)) {
      throw error;
    }
    expect(error.statusCode).toBe(400);
    expect(error.message).toMatch(pattern);
    return;
  }
  throw new Error('[error-factory] expected the callback to throw');
};

describe('MessageCode.build throws ApplicationError, unbundled', () => {
  test('too few segments', () => {
    expectApplicationError(() => MessageCode.build({ parts: ['x'] }), /at least 2 segments/);
  });

  test('invalid segment format', () => {
    expectApplicationError(
      () => MessageCode.build({ parts: ['Bad-Segment', 'x'] }),
      /Invalid segment/,
    );
  });
});

describe('MessageCode.build throws ApplicationError, bundled for the browser', () => {
  test('a browser bundle of the package entry keeps the error-factory registration', async () => {
    const entryPath = path.resolve(process.cwd(), 'dist/esm/index.js');
    if (!existsSync(entryPath)) {
      throw new Error(
        '[error-factory] packages/inversion/dist/esm/index.js is missing - run `make inversion` first.',
      );
    }

    const probeDirectory = await mkdtemp(path.join(tmpdir(), 'ignis-error-factory-probe-'));
    try {
      const probePath = path.join(probeDirectory, 'probe.ts');
      const outPath = path.join(probeDirectory, 'out.js');
      await writeFile(
        probePath,
        `import { MessageCode } from ${JSON.stringify(entryPath)};\n` +
          `try {\n` +
          `  MessageCode.build({ parts: ['x'] });\n` +
          `} catch (e) {\n` +
          `  console.log(e.constructor.name, e.statusCode);\n` +
          `}\n`,
      );

      const build = Bun.spawnSync({
        cmd: ['bun', 'build', probePath, '--target=browser', `--outfile=${outPath}`],
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (!build.success) {
        throw new Error(`[error-factory] bundle failed: ${build.stderr.toString()}`);
      }

      const run = Bun.spawnSync({ cmd: ['bun', outPath], stdout: 'pipe', stderr: 'pipe' });
      expect(run.stdout.toString().trim()).toBe('ApplicationError 400');
    } finally {
      await rm(probeDirectory, { recursive: true, force: true });
    }
  });
});
