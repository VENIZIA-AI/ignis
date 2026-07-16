import { describe, expect, test } from 'bun:test';
import { HTTP } from '@/common/constants';
import type { TErrorDefinition, TRegisterErrors } from '@/modules/error';
import { ErrorScopes, getError } from '@/modules/error';

/**
 * BANA compatibility probe. Every shape below is copied from a real BANA call site; this file fails
 * to compile the moment the framework stops accepting one of them. See the crosscheck rule: a
 * change that is green in-repo but breaks BANA's call shapes is not done.
 */
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
        key: 'server.core.slug.create.taken',
        statusCode: HTTP.ResultCodes.RS_4.Conflict,
        category: ErrorScopes.BUSINESS,
        message: 'Slug already taken: %{slug}',
      },
    } as const satisfies Record<string, TErrorDefinition>;

    // Verbatim from packages/core/src/utilities/slug.utility.ts:72
    const error = getError({ error: SlugErrors.SLUG_TAKEN, messageArgs: { slug: 've-hoa-nhac' } });

    expect(error.statusCode).toBe(409);
    expect(error.messageCode).toBe('server.core.slug.create.taken');
    // The 3 FE call sites that read `extra.messageArgs` keep working.
    expect(error.extra?.messageArgs).toEqual({ slug: 've-hoa-nhac' });
  });

  test('registry registration compiles with literal keys preserved', () => {
    const ShiftErrors = {
      DRAWER_BUSY: {
        key: 'server.sale.shift.drawer.busy',
        statusCode: HTTP.ResultCodes.RS_4.Conflict,
        message: 'Drawer busy',
      },
    } as const satisfies Record<string, TErrorDefinition>;

    const registered: TRegisterErrors<typeof ShiftErrors> = {
      'server.sale.shift.drawer.busy': true,
    };

    expect(ShiftErrors.DRAWER_BUSY.key).toBe('server.sale.shift.drawer.busy');
    expect(registered['server.sale.shift.drawer.busy']).toBe(true);
  });
});

/**
 * An application that wraps `getError` and forwards a typed variable keeps working: the index
 * signature sweeps whatever the framework does not model into `extra`, wrapper or not. Excess
 * property checking would not have protected this path anyway - it is a freshness rule, and a
 * forwarded variable is not fresh.
 */
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

/**
 * Spreading a definition instead of passing it as `error` reads naturally and is wrong: a definition
 * carries `key`, `getError` expects `messageCode`, so the code lands in `extra.key` and the error
 * degrades to `core.system_error` - unlocalizable, since clients branch on `messageCode`.
 *
 * The type system does not catch it: the index signature that carries context accepts `key` too,
 * and a spread is not a fresh literal anyway. An application audit found 9 of these live in BANA -
 * they predate this module and are a bug to fix at the call site, not a regression.
 */
describe('spreading a definition into getError silently downgrades it', () => {
  const FinanceAccountErrors = {
    DEFAULT_CONFLICT: {
      key: 'server.core.finance_account.default.conflict',
      statusCode: HTTP.ResultCodes.RS_4.Conflict,
      message: 'Another account is already the default.',
    },
  } as const satisfies Record<string, TErrorDefinition>;

  test('the spread form loses the code - the status and message survive, so it looks fine', () => {
    const error = getError({ ...FinanceAccountErrors.DEFAULT_CONFLICT });

    expect(error.messageCode).toBe('core.system_error');
    expect(error.statusCode).toBe(409);
    expect(error.extra).toEqual({ key: 'server.core.finance_account.default.conflict' });
  });

  test('the correct form keeps the key', () => {
    const error = getError({ error: FinanceAccountErrors.DEFAULT_CONFLICT });

    expect(error.messageCode).toBe('server.core.finance_account.default.conflict');
    expect(error.statusCode).toBe(409);
  });
});

describe("a wrapper's by-definition branch still forwards correctly", () => {
  const banaGetError = (opts: { error: TErrorDefinition; messageArgs?: Record<string, unknown> }) =>
    getError(opts);

  test('key, statusCode and messageArgs all arrive', () => {
    const error = banaGetError({
      error: { key: 'server.sale.shift.drawer.busy', statusCode: 409, message: 'Drawer busy' },
      messageArgs: { drawerId: 3 },
    });

    expect(error.messageCode).toBe('server.sale.shift.drawer.busy');
    expect(error.statusCode).toBe(409);
    expect(error.extra?.messageArgs).toEqual({ drawerId: 3 });
    expect(error.normalized.args).toEqual({ drawerId: 3 });
  });
});
