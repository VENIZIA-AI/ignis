import { describe, expect, test } from 'bun:test';

/** Bun.build() can't run in-process here (plugin registration dies on unrelated node_modules reads once other suites are loaded); the probe runs in a child process, matching how a real binary compiles. */
interface TProbeResult {
  success: boolean;
  hasOnDiskWasmRead?: boolean;
  hasInlinedWasm?: boolean;
  hasRequireCall?: boolean;
  hasInlinedModule?: boolean;
  hasBareSpecifier?: boolean;
  hasSkippedRequire?: boolean;
  hasLazyRequire?: boolean;
  hasInjectedImport?: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

const runProbe = (opts: { fixture: string; args: string[] }): TProbeResult => {
  const script = `src/__tests__/kafka/fixtures/${opts.fixture}.ts`;

  const executed = Bun.spawnSync({
    cmd: ['bun', script, ...opts.args],
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = executed.stdout.toString().trim();

  if (executed.exitCode !== 0 || !stdout) {
    throw new Error(
      `[${opts.fixture}] probe failed | stdout: ${stdout} | stderr: ${executed.stderr.toString()}`,
    );
  }

  return JSON.parse(stdout.split('\n').at(-1) ?? '{}');
};

describe('platformaticWasmPlugin', () => {
  test('bundling without the plugin keeps the on-disk native.wasm read', () => {
    const result = runProbe({ fixture: 'wasm-plugin-probe', args: [] });

    expect(result.success).toBe(true);
    expect(result.hasOnDiskWasmRead).toBe(true);
  });

  test('the plugin redirects @platformatic/wasm-utils to its inlined bundled entrypoint', () => {
    const result = runProbe({ fixture: 'wasm-plugin-probe', args: ['--plugin'] });

    expect(result.success).toBe(true);
    expect(result.hasOnDiskWasmRead).toBe(false);
    expect(result.hasInlinedWasm).toBe(true);
  });

  test('a compiled binary boots instead of dying with $bunfs ENOENT', () => {
    const result = runProbe({ fixture: 'wasm-plugin-probe', args: ['--all', '--compile'] });

    expect(result.success).toBe(true);
    expect(result.stderr).not.toContain('ENOENT');
    expect(result.stdout).toBe('ok');
    expect(result.exitCode).toBe(0);
  });
});

describe('platformaticRequirePlugin', () => {
  test('the plugin replaces the module-scope require() with an inlined static import', () => {
    const result = runProbe({ fixture: 'require-plugin-probe', args: ['--plugin'] });

    expect(result.success).toBe(true);
    expect(result.hasBareSpecifier).toBe(false);
    expect(result.hasInlinedModule).toBe(true);
  });

  test('bundling without the plugin leaves the specifier unresolved', () => {
    const result = runProbe({ fixture: 'require-plugin-probe', args: [] });

    expect(result.success).toBe(true);
    expect(result.hasBareSpecifier).toBe(true);
    expect(result.hasInlinedModule).toBe(false);
  });

  /** Asserting the failure keeps the plugin from silently becoming unnecessary without anyone noticing. */
  test('a compiled binary without the plugin dies before boot', () => {
    const result = runProbe({ fixture: 'require-plugin-probe', args: ['--compile'] });

    expect(result.success).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Cannot find package 'ajv-draft-04'");
    expect(result.hasBareSpecifier).toBe(true);
  });

  test('a compiled binary with the plugin boots and validates a draft-06 schema', () => {
    const result = runProbe({ fixture: 'require-plugin-probe', args: ['--plugin', '--compile'] });

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('ok');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.hasBareSpecifier).toBe(false);
  });

  /** Once upstream drops the module-scope require(), the plugin has to go inert rather than break the build. */
  test('a module with nothing to hoist builds unchanged', () => {
    const result = runProbe({ fixture: 'require-plugin-noop-probe', args: [] });

    expect(result.success).toBe(true);
    expect(result.hasInjectedImport).toBe(false);
    expect(result.hasSkippedRequire).toBe(true);
    expect(result.hasLazyRequire).toBe(true);
  });
});
