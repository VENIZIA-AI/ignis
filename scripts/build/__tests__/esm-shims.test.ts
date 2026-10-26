import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shimEsmSource } from '../esm-shims';

const directory = mkdtempSync(join(tmpdir(), 'esm-shims-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

/** Runs `source` as an ES module in a real `node`, which has no `__filename` there. */
const runUnderNode = (opts: { name: string; source: string }) => {
  const file = join(directory, opts.name);
  writeFileSync(file, opts.source);
  const child = Bun.spawnSync({ cmd: ['node', file], stdout: 'pipe', stderr: 'pipe' });
  return {
    exitCode: child.exitCode,
    stdout: child.stdout.toString().trim(),
    stderr: child.stderr.toString(),
    file,
  };
};

describe('shimEsmSource', () => {
  test('a file that reads neither local is returned unchanged', () => {
    const source = 'export const x = 1;\n';

    expect(shimEsmSource({ source })).toBe(source);
  });

  test('a property named like the local is not a read', () => {
    const source = 'export const name = module.__filename;\n';
    expect(shimEsmSource({ source })).toBe(source);
  });

  test('a file that declares the local itself is left alone', () => {
    const source = "const __filename = 'mine';\nexport default __filename;\n";
    expect(shimEsmSource({ source })).toBe(source);
  });

  test('the control: unshimmed, a read of __filename throws under Node ESM', () => {
    const run = runUnderNode({ name: 'control.mjs', source: 'console.log(__filename);\n' });

    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain('__filename is not defined');
  });

  test('shimmed, __filename is the path of the file under Node ESM', () => {
    const source = shimEsmSource({ source: 'console.log(__filename);\n' });
    const run = runUnderNode({ name: 'shimmed.mjs', source });

    expect(run.stderr).toBe('');
    expect(run.stdout).toBe(join(directory, 'shimmed.mjs'));
  });

  test('shimmed, __dirname is the folder of the file under Node ESM', () => {
    const source = shimEsmSource({ source: 'console.log(__dirname);\n' });
    const run = runUnderNode({ name: 'dirname.mjs', source });

    expect(run.stderr).toBe('');
    expect(run.stdout).toBe(directory);
  });
});
