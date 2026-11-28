import { Execution, getError } from '@venizia/ignis-helpers/core';
import { Authentication, RequestContextRegistry } from '@venizia/ignis-kernel';

/** What an audit column can hold. */
export type TAuditUserId = string | number | bigint;

interface IAuditUserOptions {
  allowAnonymous: boolean;
  columnField: string;
}

/**
 * Who to stamp on `created_by` / `modified_by`. Engine-neutral on purpose: the column BUILDERS
 * differ per dialect, this decision does not, and it was byte-identical in the postgres and sqlite
 * enrichers - so every review of this security-adjacent path had to happen twice.
 *
 * The user is the one of the execution frame, else the one authentication put on the request: a job or a system run
 * names it in `Execution.run`.
 *
 * The context comes from the registry, never from `hono/context-storage` directly: that module
 * constructs an `AsyncLocalStorage` in its own body, which is a `TypeError` at import in a browser.
 * A host with no resolver installed reports "no request context" - the first branch below.
 */
export class AuditUserResolver {
  /** The user to stamp, or `null` for nobody where anonymous writes are allowed. */
  static resolveAuditUserId(opts: IAuditUserOptions): TAuditUserId | null {
    const context = RequestContextRegistry.resolve();
    // The user the frame names wins over the one its request's authentication set. An empty text names nobody.
    const named = Execution.current()?.userId;
    const frameUserId = named === '' ? undefined : named;

    if (!context && frameUserId === undefined) {
      if (!opts.allowAnonymous) {
        throw getError({
          message: `[getCurrentUserId] Invalid request context to identify user | columnName: ${opts.columnField} | allowAnonymous: ${opts.allowAnonymous}`,
        });
      }

      return null;
    }

    const userId: unknown = frameUserId ?? context?.get(Authentication.AUDIT_USER_ID);

    // `0` is a user.
    if (userId === undefined || userId === null || userId === '') {
      if (!opts.allowAnonymous) {
        throw getError({
          message: `[getCurrentUserId] No AUDIT_USER_ID found in request context | columnName: ${opts.columnField} | allowAnonymous: ${opts.allowAnonymous} | userId: ${String(userId)}`,
        });
      }

      return null;
    }

    if (typeof userId !== 'string' && typeof userId !== 'number' && typeof userId !== 'bigint') {
      throw getError({
        message: `[getCurrentUserId] The audit user is not a text or a number | columnName: ${opts.columnField} | type: ${typeof userId}`,
      });
    }

    return userId;
  }

  /** The user for a text column; a number must be a safe integer. As text, because some engines store a number as `42.0`. */
  static resolveAuditUserText(opts: IAuditUserOptions): string | null {
    const userId = AuditUserResolver.resolveAuditUserId(opts);

    if (typeof userId === 'number' && !Number.isSafeInteger(userId)) {
      throw getError({
        message: `[getCurrentUserId] The audit user is not a whole number | columnName: ${opts.columnField}`,
      });
    }

    return userId === null ? null : String(userId);
  }

  /** The user for a number column: a safe integer, written as one or as decimal text. */
  static resolveAuditUserNumber(opts: IAuditUserOptions): number | null {
    const userId = AuditUserResolver.resolveAuditUserId(opts);

    if (userId === null) {
      return null;
    }

    // `Number` alone would read '0x1A', '1e3' and ' 42 '.
    const isOtherText = typeof userId === 'string' && !/^-?\d+$/.test(userId);
    const parsed = isOtherText ? Number.NaN : Number(userId);

    if (!Number.isSafeInteger(parsed)) {
      throw getError({
        message: `[getCurrentUserId] The audit user is not a whole number | columnName: ${opts.columnField}`,
      });
    }

    return parsed;
  }
}
