import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

const OUTPUT = join(__dirname, '../common/cli-output.ts');
const CLI = join(__dirname, '../cli/index.ts');
const LINES = 20_000;

describe('CliOutput in a process of its own', () => {
  test('a slow pipe reader gets every byte, also after process.stdout was used and process.exit follows', () => {
    const script = `import { CliOutput } from '${OUTPUT}';
      process.stdout.write('');
      CliOutput.log(Array.from({ length: ${LINES} }, () => 'x'.repeat(100)).join('\\n'));
      process.exit(0);`;
    // A shell pipe with a reader that starts late: the pipe buffer is full long before it reads.
    const run = Bun.spawnSync(['sh', '-c', 'bun -e "$0" | (sleep 1; wc -c)', script]);

    expect(Number(run.stdout.toString().trim())).toBe(LINES * 101);
  });

  test('log goes to stdout, warn and error go to stderr', () => {
    const script = `import { CliOutput } from '${OUTPUT}';
      CliOutput.log('to %s', 'out');
      CliOutput.warn('warned');
      CliOutput.error('failed');`;
    const run = Bun.spawnSync(['bun', '-e', script]);

    expect(run.stdout.toString()).toBe('to out\n');
    expect(run.stderr.toString()).toBe('warned\nfailed\n');
  });

  test('devz prints its usage on stdout and a refusal on stderr', () => {
    const help = Bun.spawnSync(['bun', CLI, 'clean', '--help']);
    const refused = Bun.spawnSync(['bun', CLI, 'clean', 'bogus']);

    expect(help.stdout.toString()).toStartWith('Usage: devz clean');
    expect(help.stderr.toString()).toBe('');
    expect(refused.stderr.toString()).toContain('unexpected argument "bogus"');
    expect(refused.stdout.toString()).toBe('');
  });
});
