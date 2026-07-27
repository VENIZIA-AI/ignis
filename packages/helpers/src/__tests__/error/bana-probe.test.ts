import { describe, expect, test } from 'bun:test';
import { HTTP } from '@/common/constants';
import type { TErrorDefinition, TRegisterErrors } from '@/modules/error';
import { ErrorScopes, getError } from '@/modules/error';

/** BANA compatibility probe - every shape below is copied from a real BANA call site; this file stops compiling the moment the framework rejects one of them. */
describe('BANA call shapes still compile and behave', () => {
  test('free-form: message only - the most common shape', () => {
    expect(getError({ message: 'Invalid paths for build error key!' }).statusCode).toBe(400);
  });

  test('free-form: message + messageCode + statusCode', () => {
    const error = getError({
      messageCode: 'server.core.common.internal.server_error',
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: 'Invalid paths for build error key!',
    });

    expect(error.statusCode).toBe(500);
  });

  test('free-form: arbitrary context keys ride into extra', () => {
    const error = getError({ message: 'failed', details: { tree: [1] }, userId: 7 });

    expect(error.extra).toMatchObject({ details: { tree: [1] }, userId: 7 });
  });

  test('third-party context keys survive - mq-pay attaches these and a client reads them', () => {
    const error = getError({
      statusCode: HTTP.ResultCodes.RS_4.Conflict,
      message: '[makePayment] Active transaction already exists for source',
      transaction: { id: 12, uid: 'tx-12', status: 'PENDING' },
      attempt: 3,
    });

    expect(error.extra).toEqual({
      transaction: { id: 12, uid: 'tx-12', status: 'PENDING' },
      attempt: 3,
    });
  });

  test('by-definition: the shape BANA errors.ts wraps', () => {
    const SlugErrors = {
      SLUG_TAKEN: {
        message: { text: 'Slug already taken: %{slug}', code: 'server.core.slug.create.taken' },
        statusCode: HTTP.ResultCodes.RS_4.Conflict,
        category: ErrorScopes.BUSINESS,
      },
    } as const satisfies Record<string, TErrorDefinition>;

    // Verbatim from packages/core/src/utilities/slug.utility.ts:72
    const error = getError({ error: SlugErrors.SLUG_TAKEN, messageArgs: { slug: 've-hoa-nhac' } });

    expect(error.statusCode).toBe(409);
    expect(error.normalized.code).toBe('server.core.slug.create.taken');
    // BREAKING for BANA: 3 FE sites reading `extra?.messageArgs` must move to `normalized.args`.
    expect(error.extra).toBeUndefined();
    expect(error.normalized.args).toEqual({ slug: 've-hoa-nhac' });
  });

  test('registry registration compiles with literal keys preserved', () => {
    const ShiftErrors = {
      DRAWER_BUSY: {
        message: { text: 'Drawer busy', code: 'server.sale.shift.drawer.busy' },
        statusCode: HTTP.ResultCodes.RS_4.Conflict,
      },
    } as const satisfies Record<string, TErrorDefinition>;

    const registered: TRegisterErrors<typeof ShiftErrors> = {
      'server.sale.shift.drawer.busy': true,
    };

    expect(ShiftErrors.DRAWER_BUSY.message.code).toBe('server.sale.shift.drawer.busy');
    expect(registered['server.sale.shift.drawer.busy']).toBe(true);
  });
});

/** A wrapper forwarding a typed variable to `getError` still works - the index signature sweeps unmodelled keys into `extra`, and excess property checking is a freshness rule a forwarded variable never satisfies. */
describe('a forwarding wrapper keeps carrying context into extra', () => {
  type TBanaByField = {
    messageCode?: string;
    message: string;
    statusCode?: number;
    messageArgs?: Record<string, unknown>;
    details?: unknown;
  };

  const banaGetError = (opts: TBanaByField) => getError(opts);

  test('`details` forwarded through the wrapper still reaches extra', () => {
    const error = banaGetError({ message: 'wrapped', statusCode: 503, details: { hint: 'x' } });

    expect(error.statusCode).toBe(503);
    expect(error.extra).toEqual({ details: { hint: 'x' } });
  });

  test('the explicit shape is equivalent', () => {
    const error = getError({
      message: 'wrapped',
      statusCode: 503,
      extra: { details: { hint: 'x' } },
    });

    expect(error.extra).toEqual({ details: { hint: 'x' } });
  });
});

/** Spreading a definition used to silently downgrade it to `core.system_error`; a definition now carries the same `message` shape free-form input takes, so the spread resolves identically. */
describe('spreading a definition into getError resolves the same as passing it', () => {
  const FinanceAccountErrors = {
    DEFAULT_CONFLICT: {
      message: {
        text: 'Another account is already the default.',
        code: 'server.core.finance_account.default.conflict',
      },
      statusCode: HTTP.ResultCodes.RS_4.Conflict,
    },
  } as const satisfies Record<string, TErrorDefinition>;

  test('the spread form keeps the code and carries nothing into extra', () => {
    const error = getError({ ...FinanceAccountErrors.DEFAULT_CONFLICT });

    expect(error.normalized.code).toBe('server.core.finance_account.default.conflict');
    expect(error.normalized.text).toBe('Another account is already the default.');
    expect(error.statusCode).toBe(409);
    expect(error.extra).toBeUndefined();
  });

  test('the `error` form resolves identically', () => {
    const error = getError({ error: FinanceAccountErrors.DEFAULT_CONFLICT });

    expect(error.normalized).toEqual(
      getError({ ...FinanceAccountErrors.DEFAULT_CONFLICT }).normalized,
    );
    expect(error.statusCode).toBe(409);
  });
});

describe("a wrapper's by-definition branch still forwards correctly", () => {
  const banaGetError = (opts: { error: TErrorDefinition; messageArgs?: Record<string, unknown> }) =>
    getError(opts);

  test('code, statusCode and messageArgs all arrive', () => {
    const error = banaGetError({
      error: {
        message: { text: 'Drawer busy', code: 'server.sale.shift.drawer.busy' },
        statusCode: 409,
      },
      messageArgs: { drawerId: 3 },
    });

    expect(error.normalized.code).toBe('server.sale.shift.drawer.busy');
    expect(error.statusCode).toBe(409);
    expect(error.extra).toBeUndefined();
    expect(error.normalized.args).toEqual({ drawerId: 3 });
  });
});
