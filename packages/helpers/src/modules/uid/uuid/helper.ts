import { BaseHelper } from '../../base';
import { UUID_PATTERN } from './common/constants';
import type { IUuidInspection } from './common/types';
import { UuidV4Generator } from './v4';
import { UuidV5Generator } from './v5';
import { UuidV7Generator } from './v7';

/**
 * One door for every UUID IGNIS mints: `v7()` for a database key, `v5()` for a deterministic key,
 * `v4()` for a random token.
 *
 * A facade over {@link UuidV4Generator}, {@link UuidV5Generator} and {@link UuidV7Generator} - importing one of those from
 * `@venizia/ignis-helpers/uuid` leaves the other two out of a browser bundle.
 */
export class UuidHelper extends BaseHelper {
  /**
   * Per module copy, not realm-wide: the facade holds no state - ordering lives in the shared v7
   * sequence - and a realm-wide slot would hand an older version's instance, and its generators,
   * to every newer caller.
   */
  private static instance?: UuidHelper;

  /** Random - a public identifier or a token. */
  readonly v4: () => string = UuidV4Generator.generate;

  /** Deterministic - same inputs, same id. Reproducible therefore not secret. */
  readonly v5: (opts: { namespace: string; name: string }) => string = UuidV5Generator.generate;

  /** Time-ordered - a database key. A burst past about 2048 ids per millisecond leads the wall clock. */
  readonly v7: () => string = UuidV7Generator.generate;

  constructor(opts?: { scope?: string }) {
    super({ scope: opts?.scope ?? UuidHelper.name });
  }

  static getInstance(): UuidHelper {
    UuidHelper.instance ??= new UuidHelper();
    return UuidHelper.instance;
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
