import { describe, expect, test } from 'bun:test';
import { HTTP } from '@/common/constants';
import type { TResponsedError } from '@/modules/error';
import { fromError, getError, isApplicationError, MessageCode } from '@/modules/error';

/** The payload `AppErrorMiddleware` emits for an intentional error, verbatim. */
const WIRE: TResponsedError = {
  message: 'Only %{available} left of %{variantId}.',
  statusCode: HTTP.ResultCodes.RS_4.Conflict,
  normalized: {
    text: 'Only %{available} left of %{variantId}.',
    code: 'server.core.stock_reservation.reserve.unavailable',
    args: { variantId: 'V1', available: 2 },
  },
  extra: { locationId: 'L9' },
  requestId: 'abc-123-def',
  details: { url: 'http://localhost:3000/reservations', path: '/reservations' },
};

describe('fromError', () => {
  test('round-trips a full wire payload', () => {
    const error = fromError({ error: WIRE });

    expect(error.normalized).toEqual(WIRE.normalized as never);
    expect(error.statusCode).toBe(HTTP.ResultCodes.RS_4.Conflict);
    expect(error.message).toBe('Only %{available} left of %{variantId}.');
  });

  test('produces something a catch block recognizes', () => {
    expect(isApplicationError(fromError({ error: WIRE }))).toBe(true);
  });

  test('survives a getError -> wire -> fromError round trip unchanged', () => {
    const origin = getError({
      message: {
        text: 'Duplicate %{name}',
        code: 'server.commerce.category.duplicate',
        args: { name: 'Ticket' },
      },
      statusCode: HTTP.ResultCodes.RS_4.Conflict,
    });

    const rehydrated = fromError({
      error: {
        message: origin.message,
        statusCode: origin.statusCode,
        normalized: origin.normalized,
      },
    });

    expect(rehydrated.normalized).toEqual(origin.normalized);
    expect(rehydrated.statusCode).toBe(origin.statusCode);
  });

  test('keeps requestId reachable via extra', () => {
    const error = fromError({ error: WIRE });

    expect(error.extra).toEqual({ locationId: 'L9', requestId: 'abc-123-def' });
  });

  test("drops details - url, path and stack are not the client's to hold", () => {
    expect(fromError({ error: WIRE }).extra).not.toHaveProperty('details');
  });

  test('falls back to message when normalized is absent', () => {
    const error = fromError({ error: { message: 'Bad Gateway', statusCode: 502 } });

    expect(error.normalized).toEqual({ text: 'Bad Gateway', code: MessageCode.DEFAULT, args: {} });
    expect(error.statusCode).toBe(502);
  });

  test('degrades on a payload that is not ours at all', () => {
    const error = fromError({ error: {} });

    expect(error.normalized).toEqual({ text: '', code: MessageCode.DEFAULT, args: {} });
    expect(error.statusCode).toBe(HTTP.ResultCodes.RS_4.BadRequest);
    expect(error.extra).toBeUndefined();
  });

  test('tolerates a half-built normalized', () => {
    const error = fromError({ error: { normalized: { code: 'user.not_found' } } });

    expect(error.normalized).toEqual({ text: '', code: 'user.not_found', args: {} });
  });

  test('lower-cases a code the way getError does', () => {
    expect(fromError({ error: { normalized: { code: 'User.NOT_FOUND' } } }).normalized.code).toBe(
      'user.not_found',
    );
  });
});
