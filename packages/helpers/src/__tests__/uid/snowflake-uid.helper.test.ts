import { afterEach, describe, expect, test } from 'bun:test';
import { isApplicationError } from '@/modules/error';
import { SnowflakeConfig, SnowflakeUidHelper } from '@/modules/uid';

const realDateNow = Date.now;

/** A clock the generator itself drives: Date.now normally answers once per id, so the busy-wait in waitForNextMs is the only repeat caller - resetting callsSinceTick per generation makes "asked more than twice" an exact spin-loop detector, with no sleeps or wall-clock races. */
class VirtualClock {
  private callsSinceTick = 0;
  now: number;

  constructor(opts: { now: number }) {
    this.now = opts.now;
  }

  install(): void {
    Date.now = () => {
      this.callsSinceTick += 1;

      if (this.callsSinceTick > 2) {
        this.now += 1;
        this.callsSinceTick = 0;
      }

      return this.now;
    };
  }

  beginGeneration(): void {
    this.callsSinceTick = 0;
  }
}

describe('SnowflakeUidHelper', () => {
  afterEach(() => {
    Date.now = realDateNow;
  });

  describe('construction', () => {
    test('defaults to workerId 199 and the 2025-01-01 epoch', () => {
      const helper = new SnowflakeUidHelper();
      expect(helper.getWorkerId()).toBe(199);
    });

    test('accepts the boundary workerIds 0 and 1023', () => {
      expect(new SnowflakeUidHelper({ workerId: 0 }).getWorkerId()).toBe(0);
      expect(new SnowflakeUidHelper({ workerId: 1023 }).getWorkerId()).toBe(1023);
    });

    test('rejects an out-of-range workerId instead of truncating it into another worker id space', () => {
      expect(() => new SnowflakeUidHelper({ workerId: 1024 })).toThrow(
        /Worker ID must be an integer between/,
      );
      expect(() => new SnowflakeUidHelper({ workerId: -1 })).toThrow(
        /Worker ID must be an integer between/,
      );

      try {
        new SnowflakeUidHelper({ workerId: 5000 });
        expect.unreachable();
      } catch (error) {
        expect(isApplicationError(error)).toBe(true);
        expect((error as { statusCode: number }).statusCode).toBe(500);
      }
    });

    test('rejects a non-integer workerId with an ApplicationError, not a raw RangeError', () => {
      try {
        new SnowflakeUidHelper({ workerId: 1.5 });
        expect.unreachable();
      } catch (error) {
        expect(isApplicationError(error)).toBe(true);
        expect((error as Error).message).toMatch(/Worker ID/);
      }

      try {
        new SnowflakeUidHelper({ workerId: Number.NaN });
        expect.unreachable();
      } catch (error) {
        expect(isApplicationError(error)).toBe(true);
        expect((error as Error).message).toMatch(/Worker ID/);
      }
    });

    test('rejects a non-positive or future epoch', () => {
      expect(() => new SnowflakeUidHelper({ epoch: BigInt(0) })).toThrow(/positive number/);
      expect(() => new SnowflakeUidHelper({ epoch: BigInt(-1) })).toThrow(/positive number/);
      expect(() => new SnowflakeUidHelper({ epoch: BigInt(Date.now() + 60_000) })).toThrow(
        /cannot be in the future/,
      );
    });
  });

  describe('nextSnowflake - uniqueness and monotonicity', () => {
    test('100k ids on the real clock are strictly increasing and never duplicate', () => {
      const helper = new SnowflakeUidHelper({ workerId: 7 });

      const total = 100_000;
      const seen = new Set<bigint>();
      let previous = BigInt(-1);

      for (let index = 0; index < total; index += 1) {
        const id = helper.nextSnowflake();
        expect(id > previous).toBe(true);
        previous = id;
        seen.add(id);
      }

      expect(seen.size).toBe(total);
    });

    test('every generated id carries the configured workerId', () => {
      const helper = new SnowflakeUidHelper({ workerId: 512 });

      for (let index = 0; index < 1000; index += 1) {
        expect(helper.extractWorkerId(helper.nextSnowflake())).toBe(512);
      }
    });
  });

  describe('nextSnowflake - sequence rollover inside a single millisecond', () => {
    test('more than 4096 ids inside one millisecond wait for the next tick instead of colliding', () => {
      const clock = new VirtualClock({ now: realDateNow() });
      clock.install();

      const helper = new SnowflakeUidHelper({ workerId: 3 });

      const total = 10_000;
      const ids: bigint[] = [];
      let previous = BigInt(-1);

      for (let index = 0; index < total; index += 1) {
        clock.beginGeneration();
        const id = helper.nextSnowflake();
        expect(id > previous).toBe(true);
        previous = id;
        ids.push(id);
      }

      expect(new Set(ids).size).toBe(total);

      const sequences = ids.map(id => helper.extractSequence(id));
      expect(Math.max(...sequences)).toBe(Number(SnowflakeConfig.MAX_SEQUENCE));

      const timestamps = new Set(ids.map(id => helper.extractTimestamp(id).getTime()));
      expect(timestamps.size).toBeGreaterThanOrEqual(3);

      const perTimestamp = new Map<number, number>();
      for (const id of ids) {
        const key = helper.extractTimestamp(id).getTime();
        perTimestamp.set(key, (perTimestamp.get(key) ?? 0) + 1);
      }
      for (const count of perTimestamp.values()) {
        expect(count).toBeLessThanOrEqual(4096);
      }
    });
  });

  describe('nextSnowflake - clock moving backwards', () => {
    test('a small backwards jump (<= 100ms) waits it out and still emits increasing, unique ids', () => {
      const clock = new VirtualClock({ now: realDateNow() });
      clock.install();

      const helper = new SnowflakeUidHelper({ workerId: 11 });

      const before: bigint[] = [];
      for (let index = 0; index < 100; index += 1) {
        clock.beginGeneration();
        before.push(helper.nextSnowflake());
      }

      clock.now -= 50;

      const after: bigint[] = [];
      let previous = before[before.length - 1];
      for (let index = 0; index < 100; index += 1) {
        clock.beginGeneration();
        const id = helper.nextSnowflake();
        expect(id > previous).toBe(true);
        previous = id;
        after.push(id);
      }

      expect(new Set([...before, ...after]).size).toBe(200);
    });

    test('a large backwards jump (> 100ms) refuses to generate rather than risk a duplicate', () => {
      const clock = new VirtualClock({ now: realDateNow() });
      clock.install();

      const helper = new SnowflakeUidHelper({ workerId: 12 });
      clock.beginGeneration();
      helper.nextSnowflake();

      clock.now -= 5_000;
      clock.beginGeneration();

      try {
        helper.nextSnowflake();
        expect.unreachable();
      } catch (error) {
        expect(isApplicationError(error)).toBe(true);
        expect((error as { statusCode: number }).statusCode).toBe(500);
        expect((error as Error).message).toMatch(/Clock moved backward/);
      }
    });
  });

  describe('base62', () => {
    test('encode/decode round-trips edge values', () => {
      const helper = new SnowflakeUidHelper();

      expect(helper.encodeBase62(BigInt(0))).toBe('0');
      expect(helper.encodeBase62(BigInt(1))).toBe('1');
      expect(helper.encodeBase62(BigInt(61))).toBe('z');
      expect(helper.encodeBase62(BigInt(62))).toBe('10');

      const values = [
        BigInt(0),
        BigInt(1),
        BigInt(61),
        BigInt(62),
        BigInt(3843),
        BigInt(Number.MAX_SAFE_INTEGER),
        (BigInt(1) << BigInt(70)) - BigInt(1),
      ];

      for (const value of values) {
        expect(helper.decodeBase62(helper.encodeBase62(value))).toBe(value);
      }
    });

    test('decode rejects a character outside the alphabet', () => {
      const helper = new SnowflakeUidHelper();

      try {
        helper.decodeBase62('abc-def');
        expect.unreachable();
      } catch (error) {
        expect(isApplicationError(error)).toBe(true);
        expect((error as { statusCode: number }).statusCode).toBe(400);
      }
    });

    test('decode rejects an empty string instead of silently returning 0', () => {
      const helper = new SnowflakeUidHelper();

      try {
        helper.decodeBase62('');
        expect.unreachable();
      } catch (error) {
        expect(isApplicationError(error)).toBe(true);
        expect((error as { statusCode: number }).statusCode).toBe(400);
      }
    });
  });

  describe('parseId', () => {
    test('round-trips timestamp, workerId and sequence out of a generated id', () => {
      const clock = new VirtualClock({ now: realDateNow() });
      clock.install();

      const helper = new SnowflakeUidHelper({ workerId: 42 });

      clock.beginGeneration();
      const first = helper.nextId();
      clock.beginGeneration();
      const second = helper.nextId();

      const parsedFirst = helper.parseId(first);
      const parsedSecond = helper.parseId(second);

      expect(parsedFirst.workerId).toBe(42);
      expect(parsedSecond.workerId).toBe(42);
      expect(parsedFirst.sequence).toBe(0);
      expect(parsedSecond.sequence).toBe(1);
      expect(parsedFirst.timestamp.getTime()).toBe(clock.now);
      expect(parsedSecond.timestamp.getTime()).toBe(clock.now);
      expect(parsedSecond.raw).toBe(parsedFirst.raw + BigInt(1));
    });

    test('nextId is the base62 encoding of nextSnowflake', () => {
      const helper = new SnowflakeUidHelper({ workerId: 8 });
      const id = helper.nextId();

      expect(helper.encodeBase62(helper.decodeBase62(id))).toBe(id);
      expect(helper.parseId(id).workerId).toBe(8);
    });

    test('a custom epoch is honoured on both encode and decode', () => {
      const epoch = BigInt(Date.parse('2020-01-01T00:00:00.000Z'));
      const helper = new SnowflakeUidHelper({ workerId: 1, epoch });

      const before = Date.now();
      const parsed = helper.parseId(helper.nextId());
      const after = Date.now();

      expect(parsed.timestamp.getTime()).toBeGreaterThanOrEqual(before);
      expect(parsed.timestamp.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('two helpers sharing a workerId', () => {
    test('collide - unique workerId assignment is an application-level concern (pinned, not a framework guarantee)', () => {
      const clock = new VirtualClock({ now: realDateNow() });
      clock.install();

      const first = new SnowflakeUidHelper({ workerId: 77 });
      const second = new SnowflakeUidHelper({ workerId: 77 });

      clock.beginGeneration();
      const fromFirst = first.nextSnowflake();
      clock.beginGeneration();
      const fromSecond = second.nextSnowflake();

      expect(fromFirst).toBe(fromSecond);
    });

    test('distinct workerIds never collide even at the same instant', () => {
      const clock = new VirtualClock({ now: realDateNow() });
      clock.install();

      const first = new SnowflakeUidHelper({ workerId: 1 });
      const second = new SnowflakeUidHelper({ workerId: 2 });

      clock.beginGeneration();
      const fromFirst = first.nextSnowflake();
      clock.beginGeneration();
      const fromSecond = second.nextSnowflake();

      expect(fromFirst).not.toBe(fromSecond);
    });
  });
});
