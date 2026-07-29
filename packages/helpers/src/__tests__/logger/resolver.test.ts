import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ILogger } from '@/modules/logger/common/types';
import { LoggerResolver } from '@/modules/logger/resolver';

beforeEach(() => {
  LoggerResolver.reset();
});

afterEach(() => {
  LoggerResolver.reset();
});

describe('logger resolver', () => {
  test('without a registered resolver it falls back to a console logger', () => {
    const lines: Array<string> = [];
    const original = console.log;
    console.log = (message: string) => lines.push(message);

    try {
      LoggerResolver.resolve({ scopes: ['Alpha', 'Beta'] }).info('fallback');
    } finally {
      console.log = original;
    }

    expect(lines).toEqual(['[Alpha-Beta] fallback']);
  });

  test('a registered resolver takes over', () => {
    const seen: Array<Array<string>> = [];
    const stub = { info: () => undefined } as unknown as ILogger;

    LoggerResolver.use({
      resolver: opts => {
        seen.push(opts.scopes);
        return stub;
      },
    });

    // resolve() now returns a lazy wrapper - the registered resolver only runs
    // once a logging method is called, so identity with `stub` no longer holds.
    const resolved = LoggerResolver.resolve({ scopes: ['Gamma'] });
    resolved.info('routed through the registered resolver');

    expect(seen).toEqual([['Gamma']]);
  });

  test('an instance resolved before use() upgrades in place once a resolver registers', () => {
    const resolved = LoggerResolver.resolve({ scopes: ['Upgrade'] });

    const lines: Array<string> = [];
    const original = console.log;
    console.log = (message: string) => lines.push(message);

    try {
      resolved.info('before registration');
    } finally {
      console.log = original;
    }

    expect(lines).toEqual(['[Upgrade] before registration']);

    const seen: Array<Array<string>> = [];
    const stub = { info: (message: string) => seen.push([message]) } as unknown as ILogger;
    LoggerResolver.use({ resolver: () => stub });

    resolved.info('after registration');

    expect(seen).toEqual([['after registration']]);
  });

  test('a child logger obtained via for() upgrades without being reconstructed', () => {
    const parent = LoggerResolver.resolve({ scopes: ['Parent'] });
    const child = parent.for('Child');

    const seenScopes: Array<Array<string>> = [];
    const seenMessages: Array<string> = [];

    LoggerResolver.use({
      resolver: opts => {
        seenScopes.push(opts.scopes);
        return { info: (message: string) => seenMessages.push(message) } as unknown as ILogger;
      },
    });

    child.info('child upgraded');

    expect(seenMessages).toEqual(['child upgraded']);
    expect(seenScopes).toEqual([['Parent', 'Child']]);
  });

  test('the resolver runs once per generation, not once per log call', () => {
    let callCount = 0;

    const resolved = LoggerResolver.resolve({ scopes: ['CacheHit'] });

    LoggerResolver.use({
      resolver: () => {
        callCount += 1;
        return { info: () => undefined } as unknown as ILogger;
      },
    });

    resolved.info('one');
    resolved.info('two');
    resolved.info('three');

    expect(callCount).toBe(1);

    LoggerResolver.use({
      resolver: () => {
        callCount += 1;
        return { info: () => undefined } as unknown as ILogger;
      },
    });

    resolved.info('four');

    expect(callCount).toBe(2);
  });

  test('reset restores the console fallback', () => {
    LoggerResolver.use({ resolver: () => ({ info: () => undefined }) as unknown as ILogger });
    LoggerResolver.reset();

    const lines: Array<string> = [];
    const original = console.log;
    console.log = (message: string) => lines.push(message);

    try {
      LoggerResolver.resolve({ scopes: ['Delta'] }).info('back');
    } finally {
      console.log = original;
    }

    expect(lines).toEqual(['[Delta] back']);
  });
});
