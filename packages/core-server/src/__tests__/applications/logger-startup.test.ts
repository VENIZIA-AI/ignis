import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ServerLoggerStartup } from '@/base/applications/common';
import { ConsoleLogger, LoggerFactory } from '@venizia/ignis-helpers/core';
import { WinstonLogger } from '@venizia/ignis-helpers/winston';

describe('ServerLoggerStartup.selectDefault', () => {
  beforeEach(() => {
    LoggerFactory.reset();
  });

  afterEach(() => {
    LoggerFactory.reset();
  });

  test('an application that chose no provider gets Winston', async () => {
    expect(LoggerFactory.isChosen()).toBe(false);

    await ServerLoggerStartup.selectDefault();

    expect(LoggerFactory.isChosen()).toBe(true);
    expect(LoggerFactory.currentProvider()).toBe(WinstonLogger);
  });

  test('an application that chose a provider keeps it', async () => {
    LoggerFactory.use({ provider: ConsoleLogger });

    await ServerLoggerStartup.selectDefault();

    expect(LoggerFactory.currentProvider()).toBe(ConsoleLogger);
  });

  test('a second call changes nothing', async () => {
    await ServerLoggerStartup.selectDefault();
    LoggerFactory.use({ provider: ConsoleLogger });

    await ServerLoggerStartup.selectDefault();

    expect(LoggerFactory.currentProvider()).toBe(ConsoleLogger);
  });
});
