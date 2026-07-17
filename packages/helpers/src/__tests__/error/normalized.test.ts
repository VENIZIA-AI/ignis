import { describe, expect, test } from 'bun:test';
import { HTTP } from '@/common/constants';
import type { TErrorDefinition } from '@/modules/error';
import { ErrorScopes, getError, MessageCode } from '@/modules/error';

const StockErrors = {
  RESERVE_UNAVAILABLE: {
    message: {
      text: 'Only %{available} left of %{variantId}, %{requested} requested.',
      code: 'server.core.stock_reservation.reserve.unavailable',
    },
    statusCode: HTTP.ResultCodes.RS_4.Conflict,
    category: ErrorScopes.BUSINESS,
  },
} as const satisfies Record<string, TErrorDefinition>;

describe('normalized', () => {
  test('is always built', () => {
    const error = getError({ message: 'bad input' });

    expect(error.normalized).toEqual({
      text: 'bad input',
      code: MessageCode.DEFAULT,
      args: {},
    });
  });

  test('carries messageArgs as args', () => {
    const error = getError({
      error: StockErrors.RESERVE_UNAVAILABLE,
      messageArgs: { variantId: 'V1', requested: 5, available: 2 },
    });

    expect(error.normalized).toEqual({
      text: 'Only %{available} left of %{variantId}, %{requested} requested.',
      code: 'server.core.stock_reservation.reserve.unavailable',
      args: { variantId: 'V1', requested: 5, available: 2 },
    });
  });

  test('code is the RESOLVED messageCode, not the raw input', () => {
    const error = getError({ message: 'x', messageCode: 'APP.USER.NOT_FOUND' });

    expect(error.normalized.code).toBe('app.user.not_found');
  });
});

describe('normalized - transform', () => {
  test('receives the default normalized as a snapshot and replaces it', () => {
    const seen: Array<unknown> = [];

    const error = getError({
      message: 'Only %{available} left.',
      messageCode: 'server.core.stock.low',
      statusCode: HTTP.ResultCodes.RS_4.Conflict,
      messageArgs: { available: 2 },
      transform: snapshot => {
        seen.push(snapshot);

        return {
          code: snapshot.message.code,
          args: snapshot.message.args,
          text: 'Chỉ còn 2 vé.',
        };
      },
    });

    expect(seen[0]).toEqual({
      message: {
        text: 'Only %{available} left.',
        code: 'server.core.stock.low',
        args: { available: 2 },
      },
      statusCode: 409,
      extra: undefined,
    });

    // `message` at the root and `normalized.text` are allowed to diverge - this is what transform is for.
    expect(error.message).toBe('Only %{available} left.');
    expect(error.normalized.text).toBe('Chỉ còn 2 vé.');
  });

  test('transform never leaks into extra', () => {
    const error = getError({ message: 'x', transform: () => ({ text: 't', code: 'c', args: {} }) });

    expect(error.extra).toBeUndefined();
  });

  test('without transform the default normalized is used', () => {
    const error = getError({ message: 'plain' });

    expect(error.normalized.text).toBe('plain');
  });
});

describe('extra is an explicit bucket', () => {
  test('caller context goes under an explicit `extra`', () => {
    const error = getError({
      error: StockErrors.RESERVE_UNAVAILABLE,
      messageArgs: { available: 2 },
      extra: { details: { locationId: 'L9' } },
    });

    expect(error.extra).toEqual({ details: { locationId: 'L9' } });
    expect(error.normalized.args).toEqual({ available: 2 });
  });

  test('is undefined when there is nothing to carry', () => {
    expect(getError({ message: 'nothing to add' }).extra).toBeUndefined();
  });

  test('messageArgs never reaches extra - normalized.args is its only home', () => {
    const error = getError({ message: 'x', messageArgs: { a: 1 } });

    expect(error.extra).toBeUndefined();
    expect(error.normalized.args).toEqual({ a: 1 });
  });
});

describe('cause reaches Error.cause, not extra', () => {
  test('a wrapped failure keeps its cause where every tool looks for it', () => {
    const root = new Error('root cause');
    const error = getError({ message: 'wrap', cause: root });

    // Previously `cause` was swept into `extra.cause` by the catchall and `Error.cause` stayed
    // undefined, so the middleware - which reads `error.cause` - never surfaced it.
    expect(error.cause).toBe(root);
    expect(error.extra).toBeUndefined();
  });
});
