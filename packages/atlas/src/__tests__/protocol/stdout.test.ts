import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

// __dirname, not import.meta: tsconfig.json (unlike tsconfig.build.json) does not exclude
// __tests__, and this package's module mode treats every file as CommonJS output.
const PACKAGE_ROOT = join(__dirname, '../../..');
const REPOSITORY_ROOT = join(PACKAGE_ROOT, '../..');
const READ_WINDOW_MS = 2000;

const REQUESTS = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'search', arguments: { query: 'bootChecks' } },
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** A line is a JSON-RPC frame when it parses and carries the fixed `jsonrpc: '2.0'` marker. */
const isJsonRpcLine = (line: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) && parsed.jsonrpc === '2.0';
  } catch {
    return false;
  }
};

/** Writes every request, closes stdin, then collects stdout for `windowMs` before the caller kills the process. */
const collectStdout = async (opts: {
  process: Bun.PipedSubprocess;
  windowMs: number;
}): Promise<string> => {
  const { process: child, windowMs } = opts;

  for (const request of REQUESTS) {
    await child.stdin.write(`${JSON.stringify(request)}\n`);
  }
  await child.stdin.end();

  const decoder = new TextDecoder();
  let stdout = '';
  const reading = (async () => {
    for await (const chunk of child.stdout) {
      stdout += decoder.decode(chunk, { stream: true });
    }
  })();
  // Drained but never asserted on: an unread stderr pipe would fill and block the child.
  const draining = child.stderr.pipeTo(new WritableStream());

  await Promise.race([reading, Bun.sleep(windowMs)]);
  child.kill();
  await Promise.all([reading, draining]);

  return stdout;
};

/**
 * Black-box, not in-process: spawns the real `bun src/cli.ts mcp` a client would run, so anything
 * writing to stdout outside `Transport.run()` fails here, not at a client's stdio stream.
 */
describe('stdout discipline - the mcp subprocess over real stdio', () => {
  test('writes nothing but JSON-RPC frames to stdout for initialize, tools/list and search', async () => {
    const child = Bun.spawn(['bun', 'src/cli.ts', 'mcp', '--root', REPOSITORY_ROOT], {
      cwd: PACKAGE_ROOT,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await collectStdout({ process: child, windowMs: READ_WINDOW_MS });
    const lines = stdout.split('\n').filter(line => line.trim().length > 0);

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(isJsonRpcLine(line), `not a JSON-RPC line: ${line}`).toBe(true);
    }
  });
});
