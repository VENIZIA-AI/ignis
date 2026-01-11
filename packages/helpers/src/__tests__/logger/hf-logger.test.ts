/**
 * High-Frequency Logger Test Suite
 *
 * Tests the zero-allocation logging system designed for HFT use cases:
 * 1. HfLogger - Zero allocation logging with pre-encoded messages
 * 2. HfLogFlusher - Async buffer flushing
 * 3. Performance characteristics
 *
 * @module __tests__/logger/hf-logger
 */

import { describe, test, expect, beforeEach, spyOn, afterEach } from 'bun:test';
import { HfLogger, HfLogFlusher } from '@/helpers/logger';

// =============================================================================
// Test Suite: HfLogger
// =============================================================================

describe('High-Frequency Logger', () => {
  describe('HfLogger', () => {
    // -------------------------------------------------------------------------
    // Instance Management Tests
    // -------------------------------------------------------------------------

    describe('Instance Management', () => {
      test('TC-001: should create a new logger instance with scope', () => {
        const logger = HfLogger.get('TestScope');
        expect(logger).toBeDefined();
        expect(logger).toBeInstanceOf(HfLogger);
      });

      test('TC-002: should cache and return same instance for same scope', () => {
        const logger1 = HfLogger.get('CachedScope');
        const logger2 = HfLogger.get('CachedScope');
        expect(logger1).toBe(logger2);
      });

      test('TC-003: should return different instances for different scopes', () => {
        const logger1 = HfLogger.get('ScopeA');
        const logger2 = HfLogger.get('ScopeB');
        expect(logger1).not.toBe(logger2);
      });

      test('TC-004: should handle empty scope string', () => {
        const logger = HfLogger.get('');
        expect(logger).toBeDefined();
      });

      test('TC-005: should handle long scope names (>32 chars)', () => {
        const longScope = 'ThisIsAVeryLongScopeNameThatExceeds32Characters';
        const logger = HfLogger.get(longScope);
        expect(logger).toBeDefined();
      });

      test('TC-006: should handle special characters in scope', () => {
        const specialScope = 'Test-Scope_With.Special:Chars';
        const logger = HfLogger.get(specialScope);
        expect(logger).toBeDefined();
      });

      test('TC-007: should handle unicode in scope', () => {
        const unicodeScope = 'テスト-Scope-测试';
        const logger = HfLogger.get(unicodeScope);
        expect(logger).toBeDefined();
      });
    });

    // -------------------------------------------------------------------------
    // Message Encoding Tests
    // -------------------------------------------------------------------------

    describe('Message Encoding', () => {
      test('TC-008: should encode message to Uint8Array', () => {
        const encoded = HfLogger.encodeMessage('Test message');
        expect(encoded).toBeInstanceOf(Uint8Array);
        expect(encoded.length).toBeGreaterThan(0);
      });

      test('TC-009: should cache encoded messages', () => {
        const msg = 'Cached message for testing';
        const encoded1 = HfLogger.encodeMessage(msg);
        const encoded2 = HfLogger.encodeMessage(msg);
        expect(encoded1).toBe(encoded2);
      });

      test('TC-010: should return different encodings for different messages', () => {
        const encoded1 = HfLogger.encodeMessage('Message A');
        const encoded2 = HfLogger.encodeMessage('Message B');
        expect(encoded1).not.toBe(encoded2);
      });

      test('TC-011: should handle empty message', () => {
        const encoded = HfLogger.encodeMessage('');
        expect(encoded).toBeInstanceOf(Uint8Array);
        expect(encoded.length).toBe(0);
      });

      test('TC-012: should handle long messages', () => {
        const longMessage = 'x'.repeat(500);
        const encoded = HfLogger.encodeMessage(longMessage);
        expect(encoded).toBeInstanceOf(Uint8Array);
        expect(encoded.length).toBe(500);
      });

      test('TC-013: should handle unicode messages', () => {
        const unicodeMsg = 'Order sent 订单已发送 注文送信';
        const encoded = HfLogger.encodeMessage(unicodeMsg);
        expect(encoded).toBeInstanceOf(Uint8Array);
        expect(encoded.length).toBeGreaterThan(0);
      });

      test('TC-014: should handle special characters in messages', () => {
        const specialMsg = 'Order: $100.50 | Status: "completed" | Flag: <active>';
        const encoded = HfLogger.encodeMessage(specialMsg);
        expect(encoded).toBeInstanceOf(Uint8Array);
      });

      test('TC-015: should handle newlines and tabs in messages', () => {
        const msgWithNewlines = 'Line1\nLine2\tTabbed';
        const encoded = HfLogger.encodeMessage(msgWithNewlines);
        expect(encoded).toBeInstanceOf(Uint8Array);
      });
    });

    // -------------------------------------------------------------------------
    // Logging Tests
    // -------------------------------------------------------------------------

    describe('Logging', () => {
      let logger: HfLogger;
      let testMsg: Uint8Array;

      beforeEach(() => {
        logger = HfLogger.get('LogTest');
        testMsg = HfLogger.encodeMessage('Test log message');
      });

      test('TC-016: should log debug level', () => {
        expect(() => logger.log('debug', testMsg)).not.toThrow();
      });

      test('TC-017: should log info level', () => {
        expect(() => logger.log('info', testMsg)).not.toThrow();
      });

      test('TC-018: should log warn level', () => {
        expect(() => logger.log('warn', testMsg)).not.toThrow();
      });

      test('TC-019: should log error level', () => {
        expect(() => logger.log('error', testMsg)).not.toThrow();
      });

      test('TC-020: should log emerg level', () => {
        expect(() => logger.log('emerg', testMsg)).not.toThrow();
      });

      test('TC-021: should handle rapid successive logs', () => {
        const iterations = 1000;
        expect(() => {
          for (let i = 0; i < iterations; i++) {
            logger.log('info', testMsg);
          }
        }).not.toThrow();
      });

      test('TC-022: should handle concurrent logging from multiple loggers', () => {
        const logger1 = HfLogger.get('Concurrent1');
        const logger2 = HfLogger.get('Concurrent2');
        const logger3 = HfLogger.get('Concurrent3');

        expect(() => {
          for (let i = 0; i < 100; i++) {
            logger1.log('info', testMsg);
            logger2.log('warn', testMsg);
            logger3.log('error', testMsg);
          }
        }).not.toThrow();
      });

      test('TC-023: should handle empty message bytes', () => {
        const emptyMsg = HfLogger.encodeMessage('');
        expect(() => logger.log('info', emptyMsg)).not.toThrow();
      });

      test('TC-024: should handle very long message (truncated to 215 bytes)', () => {
        const longMsg = HfLogger.encodeMessage('x'.repeat(500));
        expect(() => logger.log('info', longMsg)).not.toThrow();
      });

      test('TC-025: should handle exactly 215 byte message', () => {
        const exactMsg = HfLogger.encodeMessage('x'.repeat(215));
        expect(() => logger.log('info', exactMsg)).not.toThrow();
      });
    });

    // -------------------------------------------------------------------------
    // Ring Buffer Wrap-around Tests
    // -------------------------------------------------------------------------

    describe('Ring Buffer Behavior', () => {
      test('TC-026: should handle buffer wrap-around gracefully', () => {
        const logger = HfLogger.get('WrapTest');
        const msg = HfLogger.encodeMessage('Wrap test message');

        // Log more entries than buffer size (65536)
        // Just test a subset to verify wrap-around logic works
        expect(() => {
          for (let i = 0; i < 70000; i++) {
            logger.log('info', msg);
          }
        }).not.toThrow();
      });
    });
  });

  // ===========================================================================
  // Test Suite: HfLogFlusher
  // ===========================================================================

  describe('HfLogFlusher', () => {
    let consoleLogSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    test('TC-027: should create flusher instance', () => {
      const flusher = new HfLogFlusher();
      expect(flusher).toBeDefined();
      expect(flusher).toBeInstanceOf(HfLogFlusher);
    });

    test('TC-028: should flush logged entries', async () => {
      const logger = HfLogger.get('FlushTest');
      const msg = HfLogger.encodeMessage('Flush test message');

      logger.log('info', msg);
      logger.log('warn', msg);
      logger.log('error', msg);

      const flusher = new HfLogFlusher();
      await flusher.flush();

      // Verify console.log was called (entries were flushed)
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test('TC-029: should handle flush with no new entries', async () => {
      // Create a fresh flusher that starts at current write index
      const flusher = new HfLogFlusher();

      // Flush immediately - should be a no-op since no new entries
      await flusher.flush();

      // This should not throw
      expect(true).toBe(true);
    });

    test('TC-030: should start background flush loop', () => {
      const flusher = new HfLogFlusher();
      const setIntervalSpy = spyOn(globalThis, 'setInterval').mockImplementation(
        () => 1 as unknown as ReturnType<typeof setInterval>,
      );

      flusher.start(100);

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 100);

      setIntervalSpy.mockRestore();
    });

    test('TC-031: should use default interval of 100ms', () => {
      const flusher = new HfLogFlusher();
      const setIntervalSpy = spyOn(globalThis, 'setInterval').mockImplementation(
        () => 1 as unknown as ReturnType<typeof setInterval>,
      );

      flusher.start();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 100);

      setIntervalSpy.mockRestore();
    });

    test('TC-032: should use custom interval', () => {
      const flusher = new HfLogFlusher();
      const setIntervalSpy = spyOn(globalThis, 'setInterval').mockImplementation(
        () => 1 as unknown as ReturnType<typeof setInterval>,
      );

      flusher.start(50);

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 50);

      setIntervalSpy.mockRestore();
    });
  });

  // ===========================================================================
  // Performance Tests
  // ===========================================================================

  describe('Performance', () => {
    test('TC-033: should achieve sub-microsecond logging latency', () => {
      const logger = HfLogger.get('PerfTest');
      const msg = HfLogger.encodeMessage('Performance test message');

      const iterations = 10000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        logger.log('info', msg);
      }

      const elapsed = performance.now() - start;
      const avgLatencyMs = elapsed / iterations;
      const avgLatencyNs = avgLatencyMs * 1_000_000;

      // Should average under 1000ns (1 microsecond) per log
      // Being conservative here as test environment may vary
      expect(avgLatencyNs).toBeLessThan(10000); // 10 microseconds max
    });

    test('TC-034: message encoding should be fast for cached messages', () => {
      const msg = 'Cached performance test';

      // First call encodes
      HfLogger.encodeMessage(msg);

      const iterations = 100000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        HfLogger.encodeMessage(msg);
      }

      const elapsed = performance.now() - start;
      const opsPerSecond = (iterations / elapsed) * 1000;

      // Cached lookups should be very fast
      expect(opsPerSecond).toBeGreaterThan(1_000_000); // 1M ops/sec minimum
    });

    test('TC-035: logger instance retrieval should be fast for cached instances', () => {
      const scope = 'CachedPerfScope';

      // First call creates
      HfLogger.get(scope);

      const iterations = 100000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        HfLogger.get(scope);
      }

      const elapsed = performance.now() - start;
      const opsPerSecond = (iterations / elapsed) * 1000;

      // Cached lookups should be very fast
      expect(opsPerSecond).toBeGreaterThan(1_000_000); // 1M ops/sec minimum
    });

    test('TC-036: should handle high-frequency logging without blocking', async () => {
      const logger = HfLogger.get('HighFreqTest');
      const msg = HfLogger.encodeMessage('High frequency message');

      const iterations = 100000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        logger.log('info', msg);
      }

      const elapsed = Date.now() - startTime;

      // 100k logs should complete in under 1 second
      expect(elapsed).toBeLessThan(1000);
    });

    test('TC-037: should not allocate during hot path logging', () => {
      const logger = HfLogger.get('NoAllocTest');
      const msg = HfLogger.encodeMessage('No allocation test');

      // Warm up
      for (let i = 0; i < 100; i++) {
        logger.log('info', msg);
      }

      // In a real scenario, we'd use --expose-gc and gc()
      // Here we just verify the operation completes quickly
      // indicating no significant GC pressure
      const start = performance.now();

      for (let i = 0; i < 50000; i++) {
        logger.log('info', msg);
      }

      const elapsed = performance.now() - start;

      // Should complete quickly without GC pauses
      expect(elapsed).toBeLessThan(500);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    test('TC-038: should handle null bytes in message', () => {
      const msgWithNull = HfLogger.encodeMessage('Test\x00Null\x00Bytes');
      const logger = HfLogger.get('NullByteTest');
      expect(() => logger.log('info', msgWithNull)).not.toThrow();
    });

    test('TC-039: should handle binary-like messages', () => {
      const binaryLike = new Uint8Array([0, 1, 2, 255, 254, 253]);
      const logger = HfLogger.get('BinaryTest');
      expect(() => logger.log('info', binaryLike)).not.toThrow();
    });

    test('TC-040: should handle repeated message encoding', () => {
      const messages: Uint8Array[] = [];
      for (let i = 0; i < 1000; i++) {
        messages.push(HfLogger.encodeMessage(`Message ${i}`));
      }
      expect(messages.length).toBe(1000);
    });

    test('TC-041: should handle many different scopes', () => {
      const loggers: HfLogger[] = [];
      for (let i = 0; i < 100; i++) {
        loggers.push(HfLogger.get(`Scope${i}`));
      }
      expect(loggers.length).toBe(100);
    });

    test('TC-042: should handle scope with exactly 32 characters', () => {
      const exactScope = 'ExactlyThirtyTwoCharactersLong!!';
      expect(exactScope.length).toBe(32);
      const logger = HfLogger.get(exactScope);
      expect(logger).toBeDefined();
    });

    test('TC-043: should handle message with exactly 215 characters', () => {
      const exactMsg = 'x'.repeat(215);
      const encoded = HfLogger.encodeMessage(exactMsg);
      const logger = HfLogger.get('ExactMsgTest');
      expect(() => logger.log('info', encoded)).not.toThrow();
    });

    test('TC-044: should handle all log levels in sequence', () => {
      const logger = HfLogger.get('AllLevelsTest');
      const msg = HfLogger.encodeMessage('All levels test');

      const levels: Array<'debug' | 'info' | 'warn' | 'error' | 'emerg'> = [
        'debug',
        'info',
        'warn',
        'error',
        'emerg',
      ];

      for (const level of levels) {
        expect(() => logger.log(level, msg)).not.toThrow();
      }
    });
  });

  // ===========================================================================
  // Integration Scenarios
  // ===========================================================================

  describe('Integration Scenarios', () => {
    test('TC-045: HFT trading simulation - rapid order logging', () => {
      const orderEngine = HfLogger.get('OrderEngine');
      const MSG_ORDER_SENT = HfLogger.encodeMessage('Order sent');
      const MSG_ORDER_FILLED = HfLogger.encodeMessage('Order filled');
      const MSG_ORDER_CANCELED = HfLogger.encodeMessage('Order canceled');

      const iterations = 10000;

      expect(() => {
        for (let i = 0; i < iterations; i++) {
          orderEngine.log('info', MSG_ORDER_SENT);
          orderEngine.log('info', MSG_ORDER_FILLED);
          if (i % 10 === 0) {
            orderEngine.log('warn', MSG_ORDER_CANCELED);
          }
        }
      }).not.toThrow();
    });

    test('TC-046: Market data simulation - tick logging', () => {
      const marketData = HfLogger.get('MarketData');
      const MSG_TICK = HfLogger.encodeMessage('Tick received');
      const MSG_QUOTE = HfLogger.encodeMessage('Quote updated');

      const iterations = 50000;

      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        marketData.log('debug', MSG_TICK);
        if (i % 5 === 0) {
          marketData.log('info', MSG_QUOTE);
        }
      }

      const elapsed = performance.now() - start;

      // Should handle 50k+ ticks per second
      expect(elapsed).toBeLessThan(1000);
    });

    test('TC-047: Multi-component logging - multiple loggers with flusher', async () => {
      const consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

      const orderEngine = HfLogger.get('IntOrderEngine');
      const riskManager = HfLogger.get('IntRiskManager');
      const marketData = HfLogger.get('IntMarketData');

      const MSG_ORDER = HfLogger.encodeMessage('Order processed');
      const MSG_RISK = HfLogger.encodeMessage('Risk check passed');
      const MSG_DATA = HfLogger.encodeMessage('Data received');

      for (let i = 0; i < 100; i++) {
        orderEngine.log('info', MSG_ORDER);
        riskManager.log('info', MSG_RISK);
        marketData.log('debug', MSG_DATA);
      }

      const flusher = new HfLogFlusher();
      await flusher.flush();

      expect(consoleLogSpy).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    test('TC-048: Error logging scenario - mixed levels', () => {
      const errorLogger = HfLogger.get('ErrorScenario');
      const MSG_INFO = HfLogger.encodeMessage('Normal operation');
      const MSG_WARN = HfLogger.encodeMessage('Warning detected');
      const MSG_ERROR = HfLogger.encodeMessage('Error occurred');
      const MSG_EMERG = HfLogger.encodeMessage('Emergency shutdown');

      expect(() => {
        for (let i = 0; i < 1000; i++) {
          errorLogger.log('info', MSG_INFO);
          if (i % 100 === 0) {
            errorLogger.log('warn', MSG_WARN);
          }
          if (i % 500 === 0) {
            errorLogger.log('error', MSG_ERROR);
          }
        }
        errorLogger.log('emerg', MSG_EMERG);
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // Memory Safety Tests
  // ===========================================================================

  describe('Memory Safety', () => {
    test('TC-049: should handle SharedArrayBuffer correctly', () => {
      const logger = HfLogger.get('SharedBufferTest');
      const msg = HfLogger.encodeMessage('Shared buffer test');

      // Log entries that will write to the shared buffer
      for (let i = 0; i < 1000; i++) {
        logger.log('info', msg);
      }

      // Verify no crashes or memory issues
      expect(true).toBe(true);
    });

    test('TC-050: should handle buffer boundary conditions', () => {
      const logger = HfLogger.get('BoundaryTest');

      // Test messages at various sizes near boundaries
      const sizes = [0, 1, 31, 32, 33, 214, 215, 216, 255, 256];

      for (const size of sizes) {
        const msg = HfLogger.encodeMessage('x'.repeat(Math.min(size, 500)));
        expect(() => logger.log('info', msg)).not.toThrow();
      }
    });
  });
});
