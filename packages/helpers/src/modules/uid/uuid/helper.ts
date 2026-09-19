import { BaseHelper } from '../../base';
import { UUID_PATTERN } from './common/constants';
import type { IUuidInspection } from './common/types';
import { uuidV4 } from './v4';
import { uuidV5 } from './v5';
import { uuidV7 } from './v7';

/**
 * One door for every UUID IGNIS mints: `v7()` for a database key, `v5()` for a deterministic key,
 * `v4()` for a random token.
 *
 * A facade over {@link uuidV4}, {@link uuidV5} and {@link uuidV7} - importing one of those from
 * `@venizia/ignis-helpers/uuid` leaves the other two out of a browser bundle.
 */
export class UuidHelper extends BaseHelper {
  /** Realm-keyed: a dual CJS+ESM build puts two copies of this class in one process. */
  private static readonly SHARED_SLOT = Symbol.for('@venizia/ignis-helpers:uuid-helper');

  /** Random - a public identifier or a token. */
  readonly v4: () => string = uuidV4;

  /** Deterministic - same inputs, same id. Reproducible therefore not secret. */
  readonly v5: (opts: { namespace: string; name: string }) => string = uuidV5;

  /** Time-ordered - a database key. A burst past 4096 ids per millisecond leads the wall clock. */
  readonly v7: () => string = uuidV7;

  constructor(opts?: { scope?: string }) {
    super({ scope: opts?.scope ?? UuidHelper.name });
  }

  static getInstance(): UuidHelper {
    const shared: UuidHelper | undefined = Reflect.get(globalThis, UuidHelper.SHARED_SLOT);
    if (shared) {
      return shared;
    }

    const created = new UuidHelper();
    Reflect.set(globalThis, UuidHelper.SHARED_SLOT, created);
    return created;
  }

  /** Lowercase, version 1-8, RFC variant - the nil and max placeholders are refused. */
  static isValid(value: string): boolean {
    return UUID_PATTERN.test(value);
  }

  /** Reads the version, and for v7 the creation time; undefined when it is not a UUID. */
  inspect(opts: { value: string }): IUuidInspection | undefined {
    const { value } = opts;

    if (!UUID_PATTERN.test(value)) {
      return undefined;
    }

    const version = Number.parseInt(value[14], 16);
    if (version !== 7) {
      return { version };
    }

    const milliseconds = Number.parseInt(value.slice(0, 8) + value.slice(9, 13), 16);
    return { version, createdAt: new Date(milliseconds) };
  }
}
