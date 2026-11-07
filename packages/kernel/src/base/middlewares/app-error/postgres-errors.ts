import type { IPostgresError } from './common';

/** A SQLSTATE is five characters of digits and upper-case letters (Postgres appendix A); `ECONNRESET`, a gRPC number or a lower-case word is not one. */
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

/** The driver spellings of each optional field, in the order tried: node-postgres and PGlite use the first, postgres-js the second. */
const FIELD_SPELLINGS: Record<Exclude<keyof IPostgresError, 'code'>, readonly string[]> = {
  constraint: ['constraint', 'constraint_name'],
  detail: ['detail'],
  table: ['table', 'table_name'],
  column: ['column', 'column_name'],
  schema: ['schema', 'schema_name'],
  message: ['message'],
};

/** Finds the Postgres error in a thrown value, through the `cause` chain an ORM builds around a driver error. The error handler uses it; so can your code. */
export class PostgresErrors {
  /** How many `cause` hops the walk follows: the thrown error is hop 0, so an error 10 hops down is found and one 11 hops down is not. */
  static readonly MAX_DEPTH = 10;

  /** Reads one property and never throws: a getter that throws, or a Proxy trap that does, reads as `undefined`. */
  private static read(opts: { target: object; key: string }): unknown {
    try {
      return Reflect.get(opts.target, opts.key);
      // eslint-disable-next-line venizia/no-silent-catch -- a hostile getter or Proxy is the input this helper exists to survive; the caller treats the property as absent
    } catch {
      return undefined;
    }
  }

  /** The first spelling of a field that holds a string, or `undefined`. */
  private static readString(opts: {
    target: object;
    spellings: readonly string[];
  }): string | undefined {
    for (const key of opts.spellings) {
      const value = PostgresErrors.read({ target: opts.target, key });

      if (typeof value === 'string') {
        return value;
      }
    }

    return undefined;
  }

  /** Normalizes one driver error into the result type, or `undefined` when its `code` is not a SQLSTATE. */
  private static normalize(opts: { target: object }): IPostgresError | undefined {
    const { target } = opts;
    const code = PostgresErrors.read({ target, key: 'code' });

    if (typeof code !== 'string' || !SQLSTATE_PATTERN.test(code)) {
      return undefined;
    }

    const result: IPostgresError = { code };

    // Only the fields the driver set: an absent field stays absent rather than becoming `undefined`.
    for (const [name, spellings] of Object.entries(FIELD_SPELLINGS)) {
      const value = PostgresErrors.readString({ target, spellings });

      if (value !== undefined) {
        Reflect.set(result, name, value);
      }
    }

    return result;
  }

  /**
   * Finds the Postgres error in a thrown value, looking through `cause` (an ORM wraps the driver error, sometimes more than once). The outermost error with a SQLSTATE `code` wins.
   * Never throws: a value that is not an object, a cycle, a getter that throws and a Proxy all end in `undefined`.
   */
  static find(opts: { error: unknown }): IPostgresError | undefined {
    const visited = new Set<object>();
    let current: unknown = opts.error;

    for (let depth = 0; depth <= PostgresErrors.MAX_DEPTH; depth += 1) {
      if (typeof current !== 'object' || current === null || visited.has(current)) {
        return undefined;
      }

      visited.add(current);

      const found = PostgresErrors.normalize({ target: current });

      if (found) {
        return found;
      }

      current = PostgresErrors.read({ target: current, key: 'cause' });
    }

    return undefined;
  }
}
