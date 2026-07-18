import { describe, expect, test } from 'bun:test';

/**
 * Bun.build() can't run in-process here (plugin registration dies on unrelated node_modules
 * reads once other suites are loaded); the probe runs in a child process, matching how a real binary compiles.
 */
interface TProbeResult {
  success: boolean;
  hasOnDiskWasmRead?: boolean;
  hasInlinedWasm?: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

const runProbe = (opts: { args: string[] }): TProbeResult => {
  const executed = Bun.spawnSync({
    cmd: ['bun', 'src/__tests__/kafka/fixtures/wasm-plugin-probe.ts', ...opts.args],
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = executed.stdout.toString().trim();

  if (executed.exitCode !== 0 || !stdout) {
    throw new Error(
      `[wasm-plugin-probe] probe failed | stdout: ${stdout} | stderr: ${executed.stderr.toString()}`,
    );
  }

  return JSON.parse(stdout.split('\n').at(-1) ?? '{}');
};

describe('platformaticWasmPlugin', () => {
  test('bundling without the plugin keeps the on-disk native.wasm read', () => {
    const result = runProbe({ args: [] });

    expect(result.success).toBe(true);
    expect(result.hasOnDiskWasmRead).toBe(true);
  });

  test('the plugin redirects @platformatic/wasm-utils to its inlined bundled entrypoint', () => {
    const result = runProbe({ args: ['--plugin'] });

    expect(result.success).toBe(true);
    expect(result.hasOnDiskWasmRead).toBe(false);
    expect(result.hasInlinedWasm).toBe(true);
  });

  test('a compiled binary boots instead of dying with $bunfs ENOENT', () => {
    const result = runProbe({ args: ['--plugin', '--compile'] });

    expect(result.success).toBe(true);
    expect(result.stderr).not.toContain('ENOENT');
    expect(result.stdout).toBe('ok');
    expect(result.exitCode).toBe(0);
  });
});
