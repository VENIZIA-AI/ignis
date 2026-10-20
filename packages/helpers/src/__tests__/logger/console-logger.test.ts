import { describe, expect, test } from 'bun:test';
import { ConsoleLogger } from '@/modules/logger/base/console';
import { LogLevels } from '@/modules/logger/common/types';

describe('ConsoleLogger', () => {
  test('get() returns a logger that prefixes its scope', () => {
    const lines: Array<string> = [];
    const original = console.log;
    console.log = (message: string) => lines.push(message);

    try {
      ConsoleLogger.get({ scope: 'Probe' }).info('hello');
    } finally {
      console.log = original;
    }

    expect(lines).toEqual(['[Probe] hello']);
  });

  test('an empty scope emits no prefix', () => {
    const lines: Array<string> = [];
    const original = console.log;
    console.log = (message: string) => lines.push(message);

    try {
      ConsoleLogger.get({ scope: '' }).info('bare');
    } finally {
      console.log = original;
    }

    expect(lines).toEqual(['bare']);
  });

  test('for() derives a child scope', () => {
    const child = ConsoleLogger.get({ scope: 'Parent' }).for('childMethod');
    expect(child).toBeDefined();

    const lines: Array<string> = [];
    const original = console.log;
    console.log = (message: string) => lines.push(message);

    try {
      child.info('nested');
    } finally {
      console.log = original;
    }

    expect(lines).toEqual(['[Parent-childMethod] nested']);
  });

  test('log() routes by level', () => {
    const warnings: Array<string> = [];
    const original = console.warn;
    console.warn = (message: string) => warnings.push(message);

    try {
      ConsoleLogger.get({ scope: 'Probe' }).log(LogLevels.WARN, 'careful');
    } finally {
      console.warn = original;
    }

    expect(warnings).toEqual(['[Probe] careful']);
  });
});
