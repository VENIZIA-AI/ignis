/** CronHelper Test Suite */

import { CronHelper, ICronHelperOptions } from '@/modules/cron';
import { isApplicationError } from '@/modules/error';
import { afterEach, describe, expect, mock, test } from 'bun:test';

const EVERY_SECOND = '* * * * * *';
const EVERY_MINUTE = '0 * * * * *';

const createdHelpers: CronHelper[] = [];

const createHelper = (
  opts: Partial<ICronHelperOptions> & { onTick: () => void | Promise<void> },
) => {
  const helper = CronHelper.newInstance({
    cronTime: EVERY_MINUTE,
    ...opts,
  });
  createdHelpers.push(helper);
  return helper;
};

afterEach(async () => {
  while (createdHelpers.length) {
    const helper = createdHelpers.pop();
    await helper?.instance?.stop();
  }
});

describe('CronHelper | configure', () => {
  test('rejects an empty cronTime with an ApplicationError', () => {
    expect(() => CronHelper.newInstance({ cronTime: '', onTick: () => {} })).toThrow(
      /Invalid cronTime/,
    );
  });

  test('rejects an invalid cron expression with an ApplicationError', () => {
    let thrown: unknown;

    try {
      CronHelper.newInstance({ cronTime: 'not-a-cron-expression', onTick: () => {} });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    expect(isApplicationError(thrown)).toBe(true);
    expect((thrown as Error).message).toContain('not-a-cron-expression');
  });

  test('does not auto start by default', () => {
    const helper = createHelper({ onTick: () => {} });
    expect(helper.instance.isActive).toBe(false);
  });

  test('auto starts when autoStart is true', () => {
    const helper = createHelper({ onTick: () => {}, autoStart: true });
    expect(helper.instance.isActive).toBe(true);
  });

  test('start() activates the job', () => {
    const helper = createHelper({ onTick: () => {} });
    helper.start();
    expect(helper.instance.isActive).toBe(true);
  });

  test('stop() deactivates the job', async () => {
    const helper = createHelper({ onTick: () => {}, autoStart: true });
    await helper.stop();
    expect(helper.instance.isActive).toBe(false);
  });

  test('reconfiguring stops the previous job instead of leaving two jobs firing', async () => {
    const helper = createHelper({ onTick: () => {}, cronTime: EVERY_SECOND, autoStart: true });
    const firstInstance = helper.instance;

    // configure() is async on purpose: CronJob.stop() only settles once an in-flight tick has
    // finished, and the replacement job must not start before that.
    await helper.configure();

    expect(helper.instance).not.toBe(firstInstance);
    expect(firstInstance.isActive).toBe(false);
    expect(helper.instance.isActive).toBe(true);
  });

  test('wires tz through to the cron job', () => {
    const helper = createHelper({ onTick: () => {}, tz: 'Asia/Ho_Chi_Minh' });
    expect(helper.instance.cronTime.timeZone).toBe('Asia/Ho_Chi_Minh');
  });
});

describe('CronHelper | onTick', () => {
  test('invokes the onTick handler', async () => {
    const onTick = mock(() => {});
    const helper = createHelper({ onTick });

    await helper.instance.fireOnTick();

    expect(onTick).toHaveBeenCalledTimes(1);
  });

  test('routes a synchronously throwing onTick to errorHandler without crashing', async () => {
    const errors: unknown[] = [];
    const helper = createHelper({
      onTick: () => {
        throw new Error('sync onTick boom');
      },
      errorHandler: error => {
        errors.push(error);
      },
    });

    await helper.instance.fireOnTick();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('sync onTick boom');
  });

  test('routes a rejecting async onTick to errorHandler without crashing', async () => {
    const errors: unknown[] = [];
    const helper = createHelper({
      onTick: () => Promise.reject(new Error('async onTick boom')),
      errorHandler: error => {
        errors.push(error);
      },
    });

    await helper.instance.fireOnTick();
    await Promise.resolve();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('async onTick boom');
  });

  test('fires on schedule for a per-second cron expression', async () => {
    let ticks = 0;
    const fired = new Promise<void>(resolve => {
      const helper = createHelper({
        cronTime: EVERY_SECOND,
        autoStart: true,
        onTick: () => {
          ticks += 1;
          resolve();
        },
      });
      expect(helper.instance.isActive).toBe(true);
    });

    await fired;
    expect(ticks).toBeGreaterThanOrEqual(1);
  }, 3_000);
});

describe('CronHelper | modifyCronTime', () => {
  test('applies the new schedule and keeps the internal cronTime in sync', () => {
    const helper = createHelper({ onTick: () => {}, cronTime: EVERY_MINUTE });

    helper.modifyCronTime({ cronTime: EVERY_SECOND });

    expect(helper.instance.cronTime.source).toBe(EVERY_SECOND);
    expect(helper['cronTime']).toBe(EVERY_SECOND);
  });

  test('keeps a running job running (single job, new schedule)', () => {
    const helper = createHelper({ onTick: () => {}, cronTime: EVERY_MINUTE, autoStart: true });
    const instance = helper.instance;

    helper.modifyCronTime({ cronTime: EVERY_SECOND });

    expect(helper.instance).toBe(instance);
    expect(instance.isActive).toBe(true);
    expect(instance.cronTime.source).toBe(EVERY_SECOND);
  });

  test('keeps a stopped job stopped', () => {
    const helper = createHelper({ onTick: () => {}, cronTime: EVERY_MINUTE });

    helper.modifyCronTime({ cronTime: EVERY_SECOND });

    expect(helper.instance.isActive).toBe(false);
  });

  test('fires the tick immediately when shouldFireOnTick is true', async () => {
    const onTick = mock(() => {});
    const helper = createHelper({ onTick, cronTime: EVERY_MINUTE });

    helper.modifyCronTime({ cronTime: EVERY_SECOND, shouldFireOnTick: true });
    await Promise.resolve();

    expect(onTick).toHaveBeenCalledTimes(1);
  });

  test('does not fire the tick when shouldFireOnTick is omitted', async () => {
    const onTick = mock(() => {});
    const helper = createHelper({ onTick, cronTime: EVERY_MINUTE });

    helper.modifyCronTime({ cronTime: EVERY_SECOND });
    await Promise.resolve();

    expect(onTick).not.toHaveBeenCalled();
  });

  test('rejects an invalid cronTime with an ApplicationError and keeps the current schedule', () => {
    const helper = createHelper({ onTick: () => {}, cronTime: EVERY_MINUTE, autoStart: true });

    let thrown: unknown;
    try {
      helper.modifyCronTime({ cronTime: 'not-a-cron-expression' });
    } catch (error) {
      thrown = error;
    }

    expect(isApplicationError(thrown)).toBe(true);
    expect(helper.instance.cronTime.source).toBe(EVERY_MINUTE);
    expect(helper.instance.isActive).toBe(true);
  });
});

describe('CronHelper | duplicate', () => {
  test('creates an independent job with the new cronTime and the shared handlers', async () => {
    const onTick = mock(() => {});
    const helper = createHelper({ onTick, cronTime: EVERY_MINUTE });

    const duplicated = helper.duplicate({ cronTime: EVERY_SECOND });
    createdHelpers.push(duplicated);

    expect(duplicated).not.toBe(helper);
    expect(duplicated.instance).not.toBe(helper.instance);
    expect(duplicated.instance.cronTime.source).toBe(EVERY_SECOND);
    expect(helper.instance.cronTime.source).toBe(EVERY_MINUTE);

    await duplicated.instance.fireOnTick();
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  test('inherits autoStart, so the duplicate of a running job starts on its own', async () => {
    const helper = createHelper({ onTick: () => {}, cronTime: EVERY_MINUTE, autoStart: true });

    const duplicated = helper.duplicate({ cronTime: EVERY_SECOND });
    createdHelpers.push(duplicated);

    expect(duplicated.instance.isActive).toBe(true);
    expect(helper.instance.isActive).toBe(true);

    await duplicated.stop();
    expect(helper.instance.isActive).toBe(true);
  });
});
