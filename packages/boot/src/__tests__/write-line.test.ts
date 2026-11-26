import { describe, expect, test } from 'bun:test';

const WRITE_LINE = `${import.meta.dir}/../clis/write-line.ts`;
const LINES = 20_000;

describe('writeLine in a process of its own', () => {
  test('a slow pipe reader gets every byte, also after process.stdout was used and process.exit follows', () => {
    const script = `import { writeLine } from '${WRITE_LINE}';
      process.stdout.write('');
      writeLine({ fd: 1, line: Array.from({ length: ${LINES} }, () => 'x'.repeat(100)).join('\\n') });
      process.exit(0);`;
    const run = Bun.spawnSync(['sh', '-c', 'bun -e "$0" | (sleep 1; wc -c)', script]);

    expect(Number(run.stdout.toString().trim())).toBe(LINES * 101);
  });
});
