import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { Bootstrapper } from '@/bootstrapper';
import { BOOT_PHASES } from '@/common/types';

class RecordingBooter {
  readonly calls: string[] = [];

  constructor(readonly label: string) {}

  async configure() {
    this.calls.push('configure');
  }

  async discover() {
    this.calls.push('discover');
  }

  async load() {
    this.calls.push('load');
  }
}

const buildApplication = (booters: object[]): AnyType => {
  return {
    findByTag: () => {
      return booters.map(booter => ({
        key: booter.constructor.name,
        getValue: () => booter,
      }));
    },
  };
};

describe('Bootstrapper - booter discovery is not cumulative', () => {
  test('booting twice runs each phase once per booter, not twice', async () => {
    const booter = new RecordingBooter('only');
    const bootstrapper = new Bootstrapper(buildApplication([booter]));

    await bootstrapper.boot({});
    expect(booter.calls).toEqual([...BOOT_PHASES]);

    booter.calls.length = 0;
    await bootstrapper.boot({});

    // Pushing into `this.booters` without clearing it first registers every artifact twice:
    // duplicate controllers, duplicate repository bindings.
    expect(booter.calls).toEqual([...BOOT_PHASES]);
  });
});

describe('Bootstrapper - the booters filter is honoured', () => {
  test('only the named booters run', async () => {
    class AlphaBooter extends RecordingBooter {}
    class BetaBooter extends RecordingBooter {}
    const alphaBooter = new AlphaBooter('alpha');
    const betaBooter = new BetaBooter('beta');

    const bootstrapper = new Bootstrapper(buildApplication([alphaBooter, betaBooter]));
    await bootstrapper.boot({ booters: ['AlphaBooter'] });

    expect(alphaBooter.calls).toEqual([...BOOT_PHASES]);
    // A silently ignored filter is worse than no filter: the caller believes it scoped the boot.
    expect(betaBooter.calls).toEqual([]);
  });

  test('an empty/absent filter runs every booter', async () => {
    const first = new RecordingBooter('first');
    const second = new RecordingBooter('second');
    const bootstrapper = new Bootstrapper(buildApplication([first, second]));

    await bootstrapper.boot({});

    expect(first.calls).toEqual([...BOOT_PHASES]);
    expect(second.calls).toEqual([...BOOT_PHASES]);
  });
});

describe('Bootstrapper - the boot report carries what it measured', () => {
  test('the report names the booters, the phases and their durations', async () => {
    const booter = new RecordingBooter('reported');
    const bootstrapper = new Bootstrapper(buildApplication([booter]));

    const report = await bootstrapper.boot({});

    // The timings were always collected - and then thrown away, so every caller logging the report
    // (BANA does, on every boot) has been printing `{}`.
    expect(report.booters).toEqual(['RecordingBooter']);
    expect(report.phases.map(phase => phase.phase)).toEqual([...BOOT_PHASES]);

    for (const phase of report.phases) {
      expect(phase.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(phase.durationMs)).toBe(true);
    }

    expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  test('a phase failure names the phase and the booter that threw', async () => {
    class ExplodingBooter {
      async configure() {
        throw new Error('boom');
      }
    }

    const bootstrapper = new Bootstrapper(buildApplication([new ExplodingBooter()]));

    let caught: unknown;
    try {
      await bootstrapper.boot({});
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('configure');
    expect((caught as Error).message).toContain('ExplodingBooter');
    expect((caught as Error).message).toContain('boom');
  });
});
