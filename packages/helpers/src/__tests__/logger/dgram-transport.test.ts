import { afterAll, describe, expect, test } from 'bun:test';
import { DgramTransport } from '@/modules/logger/winston';

const LEVEL = Symbol.for('level');

const buildTransport = () => {
  return new DgramTransport({
    label: 'dgram-test',
    host: '127.0.0.1',
    port: 59999,
    levels: ['info'],
    socketOptions: { type: 'udp4' },
  });
};

describe('DgramTransport - send failure must not crash the process', () => {
  const transports: Array<DgramTransport> = [];

  afterAll(() => {
    for (const transport of transports) {
      transport['client']?.close();
    }
  });

  test('a send error is swallowed into a log line, not re-emitted as an unhandled error event', () => {
    const transport = buildTransport();
    transports.push(transport);

    let callbackInvocations = 0;
    transport['client'] = {
      send: (
        _message: string,
        _port: number,
        _host: string,
        callback: (error: Error | null) => void,
      ) => {
        callback(new Error('send failed'));
      },
      close: () => {},
    } as never;

    expect(() => {
      transport.log(
        { level: 'info', message: 'boom', [LEVEL]: 'info', timestamp: 'ts' } as never,
        () => {
          callbackInvocations += 1;
        },
      );
    }).not.toThrow();
    expect(callbackInvocations).toBe(1);
  });

  test('a level outside triggerLevels still invokes the callback', () => {
    const transport = buildTransport();
    transports.push(transport);

    let callbackInvocations = 0;
    transport.log({ level: 'debug', message: 'skip', [LEVEL]: 'debug' } as never, () => {
      callbackInvocations += 1;
    });

    expect(callbackInvocations).toBe(1);
  });
});
