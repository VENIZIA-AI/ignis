import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { AbstractLogger, HfLogFlusher, HfLogger } from '@/modules/logger';
import type { ILogger, THfSinkBatch } from '@/modules/logger';
import { toBoolean } from '@/utilities/parse.utility';

const LINE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[(\w+)\] (\S+) (.*)$/;

/** Drains the shared ring first - bun runs all test files in one process, so earlier tests'
 * lines would otherwise leak into `lines()` for this test. */
const collectingFlusher = async () => {
  const batches: Array<THfSinkBatch> = [];
  const flusher = new HfLogFlusher({ sink: batch => batches.push(batch) });
  await flusher.flush();
  batches.length = 0;
  const lines = () => batches.flatMap(batch => batch.lines);
  return { flusher, batches, lines };
};

describe('HfLogger roundtrip - what goes in comes out, exactly', () => {
  test('a bytes-path entry renders ISO time, level name, scope, message - no NULs, no padding', async () => {
    const { flusher, lines } = await collectingFlusher();

    const logger = HfLogger.get('RoundTrip');
    logger.log('info', HfLogger.encodeMessage('Order sent'));
    await flusher.flush();

    expect(lines().length).toBe(1);
    const line = lines()[0];
    expect(line).toMatch(LINE_PATTERN);
    expect(line).toEndWith('[info] RoundTrip Order sent');
    expect(line.includes('\0')).toBe(false);
  });

  test('timestamps are current epoch milliseconds', async () => {
    const { flusher, lines } = await collectingFlusher();
    const before = Date.now();
    HfLogger.get('TsCheck').log('warn', HfLogger.encodeMessage('tick'));
    await flusher.flush();
    const parsed = Date.parse(lines()[0].slice(0, 24));
    expect(parsed).toBeGreaterThanOrEqual(before - 5);
    expect(parsed).toBeLessThanOrEqual(Date.now() + 5);
  });

  test('messages longer than 213 bytes truncate cleanly', async () => {
    const { flusher, lines } = await collectingFlusher();
    HfLogger.get('Trunc').log('info', HfLogger.encodeMessage('x'.repeat(500)));
    await flusher.flush();
    const message = lines()[0].match(LINE_PATTERN)![3];
    expect(message).toBe('x'.repeat(213));
  });
});

describe('HfLogger ring semantics', () => {
  test('a reused slot never leaks the previous entry tail', async () => {
    const { flusher, lines } = await collectingFlusher();

    const logger = HfLogger.get('WrapTest');
    logger.log('info', HfLogger.encodeMessage('A'.repeat(40)));
    for (let index = 0; index < 65536; index++) {
      logger.log('info', HfLogger.encodeMessage('short'));
    }
    await flusher.flush();

    const last = lines()[lines().length - 1];
    expect(last).toEndWith('[info] WrapTest short');
    expect(last.includes('A')).toBe(false);
  });

  test('lapping the flusher is counted, not disguised', async () => {
    const { flusher, batches, lines } = await collectingFlusher();
    const logger = HfLogger.get('LapTest');
    const message = HfLogger.encodeMessage('lap');
    for (let index = 0; index < 65536 + 4464; index++) {
      logger.log('info', message);
    }
    await flusher.flush();

    const droppedTotal = batches.reduce((sum, batch) => sum + batch.dropped, 0);
    expect(droppedTotal).toBe(4464);
    expect(lines().length).toBe(65536);
  });
});

describe('HfLogger implements ILogger', () => {
  test('assignable to ILogger and instanceof AbstractLogger', () => {
    const logger: ILogger = HfLogger.get('Conform');
    expect(logger).toBeInstanceOf(AbstractLogger);
  });

  test('string level methods write real lines', async () => {
    const { flusher, lines } = await collectingFlusher();
    const logger = HfLogger.get('StringPath');
    logger.info('plain string message');
    logger.warn('warned');
    await flusher.flush();
    expect(lines()[0]).toEndWith('[info] StringPath plain string message');
    expect(lines()[1]).toEndWith('[warn] StringPath warned');
  });

  test('args are formatted AND redacted, never dropped', async () => {
    const { flusher, lines } = await collectingFlusher();
    HfLogger.get('ArgsPath').error('failed: %s', { token: 'super-secret', orderId: 42 });
    await flusher.flush();
    expect(lines()[0]).toContain('orderId: 42');
    expect(lines()[0]).toContain('[REDACTED]');
    expect(lines()[0]).not.toContain('super-secret');
  });

  test('debug honors the shared gate', async () => {
    const { flusher, lines } = await collectingFlusher();
    HfLogger.get('DebugGate').debug('gated line');
    await flusher.flush();
    expect(lines().length).toBe(toBoolean(process.env.DEBUG) ? 1 : 0);
  });

  test('for() composes the scope with a dash and returns a working logger', async () => {
    const { flusher, lines } = await collectingFlusher();
    HfLogger.get('Parent').for('handle').info('from child');
    await flusher.flush();
    expect(lines()[0]).toEndWith('[info] Parent-handle from child');
  });

  test('log() accepts every TLogLevel by name, string or bytes', async () => {
    const { flusher, lines } = await collectingFlusher();
    const logger = HfLogger.get('AllLevels');
    logger.log('warn', 'via string');
    logger.log('emerg', HfLogger.encodeMessage('via bytes'));
    await flusher.flush();
    expect(lines()[0]).toContain('[warn]');
    expect(lines()[1]).toContain('[emerg]');
  });

  test('encodeMessage identity is stable until FIFO eviction', () => {
    const first = HfLogger.encodeMessage('stable-identity-check');
    expect(HfLogger.encodeMessage('stable-identity-check')).toBe(first);
    for (let index = 0; index < 4096; index++) {
      HfLogger.encodeMessage(`evictor-${index}`);
    }
    expect(HfLogger.encodeMessage('stable-identity-check')).not.toBe(first);
  });
});

describe('HfLogFlusher lifecycle and sinks', () => {
  test('start() is idempotent and stop() clears the interval', () => {
    const flusher = new HfLogFlusher({ sink: () => {} });
    flusher.start(50);
    flusher.start(50); // restart, no double-fire
    flusher.stop();
    expect(flusher['timer']).toBeNull();
  });

  test('flush() while draining returns the in-flight promise', async () => {
    const flusher = new HfLogFlusher({ sink: () => {}, batchSize: 8 });
    HfLogger.get('Reentrant');
    for (let index = 0; index < 64; index++) {
      HfLogger.get('Reentrant').log('info', HfLogger.encodeMessage('spin'));
    }
    const first = flusher.flush();
    const second = flusher.flush();
    expect(second).toBe(first);
    await first;
  });

  test('filePath default sink appends parseable lines and a lap marker when dropped > 0', async () => {
    const filePath = path.join('./app_data/logs', `hf-sink-test-${process.pid}.log`);
    fs.rmSync(filePath, { force: true });
    const flusher = new HfLogFlusher({ filePath });
    await flusher.flush();
    HfLogger.get('FileSink').log('error', HfLogger.encodeMessage('to file'));
    await flusher.flush();
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('[error] FileSink to file');
    fs.rmSync(filePath, { force: true });
  });

  test('filePath default sink writes the lap marker line when the ring is lapped', async () => {
    const filePath = path.join('./app_data/logs', `hf-sink-lap-test-${process.pid}.log`);
    fs.rmSync(filePath, { force: true });
    const flusher = new HfLogFlusher({ filePath });
    await flusher.flush();

    const logger = HfLogger.get('LapMarker');
    const message = HfLogger.encodeMessage('lap-marker');
    for (let index = 0; index < 65536 + 100; index++) {
      logger.log('info', message);
    }
    await flusher.flush();

    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('ring lapped - ');
    expect(content).toContain('entries overwritten');
    fs.rmSync(filePath, { force: true });
  });

  test('a throwing sink is logged and does not abort the drain', async () => {
    const errors: Array<string> = [];
    const originalError = console.error;
    console.error = (...parts: Array<unknown>) => {
      errors.push(String(parts[0]));
    };
    const flusher = new HfLogFlusher({
      sink: () => {
        throw new Error('sink boom'); // test-only throw site
      },
    });
    HfLogger.get('SinkFail').log('info', HfLogger.encodeMessage('x'));
    await flusher.flush();
    console.error = originalError;
    expect(errors.some(entry => entry.includes('[HfLogFlusher]'))).toBe(true);
  });

  test('invalid batchSize falls back with a warning', () => {
    const warnings: Array<string> = [];
    const originalWarn = console.warn;
    console.warn = (...parts: Array<unknown>) => {
      warnings.push(String(parts[0]));
    };
    const flusher = new HfLogFlusher({ sink: () => {}, batchSize: 0 });
    console.warn = originalWarn;
    expect(flusher['batchSize']).toBe(1024);
    expect(warnings.some(entry => entry.includes('Invalid batchSize'))).toBe(true);
  });
});
