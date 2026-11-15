import { describe, expect, test } from 'bun:test';
import { SocketIOClientHelper as NodeSocketIOClientHelper } from '@/modules/socket/socket-io';
import { SocketIOClientHelper } from '@/modules/socket/socket-io/browser';

type TSocketIOModule = typeof import('socket.io-client');

const isSocketIOModule = (value: unknown): value is TSocketIOModule =>
  typeof value === 'object' && value !== null && 'io' in value && typeof value.io === 'function';

const buildModule = () => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler),
  };
  const calls: Array<{ host: string }> = [];
  const candidate: unknown = {
    io: (host: string) => {
      calls.push({ host });

      return socket;
    },
  };

  if (!isSocketIOModule(candidate)) {
    throw new Error('The fake socket.io-client module lost its io function');
  }

  const module = candidate;

  return { handlers, calls, module };
};

const baseOptions = {
  identifier: 'browser-io',
  host: 'http://example.test',
  options: { path: '/socket.io', extraHeaders: {} },
};

describe('SocketIOClientHelper - browser entry', () => {
  test('connects with the module it is handed, and wires the lifecycle events', () => {
    const { handlers, calls, module } = buildModule();

    new SocketIOClientHelper({ ...baseOptions, module });

    expect(calls).toEqual([{ host: 'http://example.test' }]);
    expect([...handlers.keys()]).toContain('connect');
  });

  test('with no module it fails loudly instead of reaching for node', () => {
    expect(() => new SocketIOClientHelper(baseOptions)).toThrow(/option 'module' is required/);
  });

  test('the node entry is the same helper with the module lookup added', () => {
    const { calls, module } = buildModule();
    const helper = new NodeSocketIOClientHelper({ ...baseOptions, module });

    expect(helper).toBeInstanceOf(SocketIOClientHelper);
    expect(calls.length).toBe(1);
  });
});
