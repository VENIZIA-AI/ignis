import { describe, expect, test } from 'bun:test';
import { Logger } from '@/common/logger';

describe('Logger debug gate', () => {
  test('enableDebug turns output on and off', () => {
    const lines: Array<string> = [];
    const original = console.log;
    console.log = (message: string) => lines.push(message);

    try {
      Logger.enableDebug({ enabled: false });
      Logger.debug('hidden');
      Logger.enableDebug({ enabled: true });
      Logger.debug('shown');
    } finally {
      console.log = original;
      Logger.enableDebug({ enabled: false });
    }

    expect(lines).toEqual(['[DEBUG] shown']);
  });
});
