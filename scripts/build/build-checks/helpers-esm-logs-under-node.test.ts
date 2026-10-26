import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * `LoggerFactory` loads winston as its default provider with `createRequire(__filename)`. Node ESM
 * has no `__filename`, so the first log with no registered provider threw there while Bun and the
 * CommonJS build worked. The check runs the built ESM entry in a real `node` and logs one line. It
 * reads the build output as it is; it builds nothing.
 */

const LOGGER_ENTRY = resolve(
  import.meta.dir,
  '..',
  '..',
  '..',
  'packages',
  'helpers',
  'dist',
  'esm',
  'modules',
  'logger',
  'index.js',
);

const LOG_PROBE = `
import { LoggerFactory } from ${JSON.stringify(`file://${LOGGER_ENTRY}`)};
LoggerFactory.getLogger(['probe']).info('esm-default-provider-ok');
`;

describe('@venizia/ignis-helpers logger, ESM build', () => {
  test('the built entry exists (run a build first)', () => {
    expect(existsSync(LOGGER_ENTRY), `${LOGGER_ENTRY} is missing`).toBe(true);
  });

  test('logs through the default provider under Node ESM', () => {
    const child = Bun.spawnSync({
      cmd: ['node', '--input-type=module', '-e', LOG_PROBE],
      cwd: join(LOGGER_ENTRY, '..'),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = child.stdout.toString() + child.stderr.toString();
    expect(child.exitCode, output).toBe(0);
    expect(output).toContain('esm-default-provider-ok');
  });
});
