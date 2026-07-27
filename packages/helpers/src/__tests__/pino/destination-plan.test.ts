import { afterEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { Defaults } from '@/common/constants';
import { mapFrequency, mapMaxFilesToCount, resolveDestinationPlan } from '@/modules/logger/pino';

/** Pure cases only - every test saves/restores the envs it touches so suite order never matters; `.env.test` sets `APP_ENV_LOGGER_FOLDER_PATH` ambiently, so tests override or delete it explicitly. */
const ENV_KEYS = [
  'APP_ENV_LOGGER_FOLDER_PATH',
  'APP_ENV_LOGGER_FORMAT',
  'APP_ENV_LOGGER_FILE_FREQUENCY',
  'APP_ENV_LOGGER_FILE_MAX_SIZE',
  'APP_ENV_LOGGER_FILE_MAX_FILES',
] as const;

const saved: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  saved[key] = process.env[key];
}

const restoreEnv = () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = saved[key];
  }
};

const withConsoleWarn = (): { warnings: Array<string>; restore: () => void } => {
  const warnings: Array<string> = [];
  const original = console.warn;
  console.warn = (...parts: Array<unknown>) => {
    warnings.push(parts.map(part => String(part)).join(' '));
  };
  return {
    warnings,
    restore: () => {
      console.warn = original;
    },
  };
};

describe('resolveDestinationPlan', () => {
  afterEach(restoreEnv);

  test('APP_ENV_LOGGER_FOLDER_PATH set -> kind "roll" with mapped options', () => {
    process.env.APP_ENV_LOGGER_FOLDER_PATH = './app_data/logs';
    delete process.env.APP_ENV_LOGGER_FILE_FREQUENCY;
    delete process.env.APP_ENV_LOGGER_FILE_MAX_SIZE;
    delete process.env.APP_ENV_LOGGER_FILE_MAX_FILES;

    const plan = resolveDestinationPlan();

    expect(plan.kind).toBe('roll');
    if (plan.kind !== 'roll') {
      throw new Error('unreachable');
    }
    expect(plan.options.file).toBe(path.join('./app_data/logs', Defaults.APPLICATION_NAME));
    expect(plan.options.frequency).toBe('hourly');
    expect(plan.options.size).toBe('100m');
    expect(plan.options.limit.count).toBe(120); // default '5d' at hourly -> 5 * 24
    expect(plan.options.mkdir).toBe(true);
  });

  test('frequency mapping: "1h" -> hourly', () => {
    process.env.APP_ENV_LOGGER_FOLDER_PATH = './app_data/logs';
    process.env.APP_ENV_LOGGER_FILE_FREQUENCY = '1h';

    const plan = resolveDestinationPlan();
    expect(plan.kind).toBe('roll');
    if (plan.kind === 'roll') {
      expect(plan.options.frequency).toBe('hourly');
    }
  });

  test('frequency mapping: "1d" -> daily', () => {
    process.env.APP_ENV_LOGGER_FOLDER_PATH = './app_data/logs';
    process.env.APP_ENV_LOGGER_FILE_FREQUENCY = '1d';

    const plan = resolveDestinationPlan();
    expect(plan.kind).toBe('roll');
    if (plan.kind === 'roll') {
      expect(plan.options.frequency).toBe('daily');
    }
  });

  test('frequency mapping: "24h" -> daily', () => {
    process.env.APP_ENV_LOGGER_FOLDER_PATH = './app_data/logs';
    process.env.APP_ENV_LOGGER_FILE_FREQUENCY = '24h';

    const plan = resolveDestinationPlan();
    expect(plan.kind).toBe('roll');
    if (plan.kind === 'roll') {
      expect(plan.options.frequency).toBe('daily');
    }
  });

  test('frequency mapping: an unrecognized value falls back to hourly and warns', () => {
    process.env.APP_ENV_LOGGER_FOLDER_PATH = './app_data/logs';
    process.env.APP_ENV_LOGGER_FILE_FREQUENCY = 'weird';

    const { warnings, restore } = withConsoleWarn();
    const plan = resolveDestinationPlan();
    restore();

    expect(plan.kind).toBe('roll');
    if (plan.kind === 'roll') {
      expect(plan.options.frequency).toBe('hourly');
    }
    expect(warnings.some(entry => entry.includes('[mapFrequency]'))).toBe(true);
  });

  test('no FOLDER_PATH + FORMAT=text -> kind "pretty"', () => {
    delete process.env.APP_ENV_LOGGER_FOLDER_PATH;
    process.env.APP_ENV_LOGGER_FORMAT = 'text';

    expect(resolveDestinationPlan()).toEqual({ kind: 'pretty' });
  });

  test('no FOLDER_PATH + FORMAT=json -> kind "stdout"', () => {
    delete process.env.APP_ENV_LOGGER_FOLDER_PATH;
    process.env.APP_ENV_LOGGER_FORMAT = 'json';

    expect(resolveDestinationPlan()).toEqual({ kind: 'stdout' });
  });

  test('no FOLDER_PATH + FORMAT UNSET -> kind "stdout" (the locked NDJSON default - never pretty)', () => {
    delete process.env.APP_ENV_LOGGER_FOLDER_PATH;
    delete process.env.APP_ENV_LOGGER_FORMAT;

    expect(resolveDestinationPlan()).toEqual({ kind: 'stdout' });
  });
});

describe('mapFrequency', () => {
  test('"1h" -> hourly', () => {
    expect(mapFrequency('1h')).toBe('hourly');
  });

  test('"1d" -> daily', () => {
    expect(mapFrequency('1d')).toBe('daily');
  });

  test('"24h" -> daily', () => {
    expect(mapFrequency('24h')).toBe('daily');
  });

  test('undefined defaults to hourly (the "1h" default) without warning', () => {
    const { warnings, restore } = withConsoleWarn();
    const result = mapFrequency(undefined);
    restore();

    expect(result).toBe('hourly');
    expect(warnings.length).toBe(0);
  });

  test('an unrecognized value falls back to hourly and warns', () => {
    const { warnings, restore } = withConsoleWarn();
    const result = mapFrequency('weird');
    restore();

    expect(result).toBe('hourly');
    expect(warnings.some(entry => entry.includes('[mapFrequency]'))).toBe(true);
  });
});

describe('mapMaxFilesToCount', () => {
  test('"5d" + hourly -> 120', () => {
    expect(mapMaxFilesToCount({ value: '5d', frequency: 'hourly' })).toBe(120);
  });

  test('"5d" + daily -> 5', () => {
    expect(mapMaxFilesToCount({ value: '5d', frequency: 'daily' })).toBe(5);
  });

  test('"7" -> 7, regardless of frequency (a bare integer is a literal count)', () => {
    expect(mapMaxFilesToCount({ value: '7', frequency: 'hourly' })).toBe(7);
    expect(mapMaxFilesToCount({ value: '7', frequency: 'daily' })).toBe(7);
  });

  test('"x" -> falls back to the default "5d" mapping and warns', () => {
    const { warnings, restore } = withConsoleWarn();
    const result = mapMaxFilesToCount({ value: 'x', frequency: 'hourly' });
    restore();

    expect(result).toBe(120); // '5d' at hourly
    expect(warnings.some(entry => entry.includes('[mapMaxFilesToCount]'))).toBe(true);
  });

  test('undefined -> falls back to the default "5d" mapping SILENTLY (unset is normal config)', () => {
    const { warnings, restore } = withConsoleWarn();
    const result = mapMaxFilesToCount({ value: undefined, frequency: 'daily' });
    restore();

    expect(result).toBe(5); // '5d' at daily
    expect(warnings.length).toBe(0); // only a PROVIDED-but-invalid value warns
  });
});
