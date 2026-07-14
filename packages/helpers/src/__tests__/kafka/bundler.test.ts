import { describe, expect, test } from 'bun:test';

/**
 * `Bun.build()` cannot run inside the test process: with other suites already loaded, a build that
 * registers plugins dies with "Unexpected reading file" on unrelated node_modules entries. The probe
 * runs the build in a child process, which is also how a real application compiles its binary.
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
