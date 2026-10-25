import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@/common/types';
import { SocketIOClientHelper as NodeSocketIOClientHelper } from '@/modules/socket/socket-io';
import { SocketIOClientHelper } from '@/modules/socket/socket-io/browser';

const buildModule = () => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = { on: (event: string, handler: AnyType) => handlers.set(event, handler) };
  const calls: Array<{ host: string }> = [];
  const module = {
    io: (host: string) => {
      calls.push({ host });
      return socket;
    },
  } as AnyType;

  return { handlers, calls, module };
};

const baseOptions = {
  identifier: 'browser-io',
  host: 'http://example.test',
  options: {} as AnyType,
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
