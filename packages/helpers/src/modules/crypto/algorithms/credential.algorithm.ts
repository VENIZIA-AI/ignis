import { HTTP } from '@/common/constants';
import { getError } from '@/modules/error';
import {
  CredentialAlgorithms,
  DEFAULT_CREDENTIAL_ALGORITHM,
  type TCredentialAlgorithm,
} from '../common';

/** The bcrypt versions the `bcrypt` package writes. */
const BCRYPT_PREFIX = /^\$2[aby]\$/;

/** bcrypt reads only the first 72 bytes of a password. */
const BCRYPT_MAX_PASSWORD_BYTES = 72;
const MIN_COST = 4;
const MAX_COST = 31;
const DEFAULT_COST = 10;

/**
 * Storing and checking a credential (a password) over `Bun.password`. `hash` writes an argon2id hash with
 * Bun's default parameters unless `algorithm: 'bcrypt'` asks for bcrypt (`$2b$`, 60 characters, the stored
 * format of the `bcrypt` package). `verify` reads every existing bcrypt and argon2 hash, whichever
 * algorithm `hash` wrote, so a stored password is never rehashed or migrated. Needs Bun: it throws on
 * another runtime.
 *
 * Passwords longer than 72 bytes are where Bun and the `bcrypt` package differ, and it only matters for
 * bcrypt. The package keeps only the first 72 bytes; Bun keeps all of them, by hashing a longer password
 * before bcrypt sees it. Two things follow, and they are the whole truth about "the same format":
 *
 * - A hash `hash` writes for a password longer than 72 bytes is read by Bun only. The `bcrypt` package
 *   cannot verify it, so rolling back to that package, or another service reading the same column, locks
 *   those users out. Up to 72 bytes the two read each other's hashes.
 * - A hash the `bcrypt` package wrote for a longer password fails a plain `Bun.password.verify` with the full
 *   password. `verify` therefore retries a bcrypt hash with the first 72 bytes when the password is longer.
 *   That retry is for the legacy hashes. A hash `hash` wrote never needs it, because Bun reads its own hash on
 *   the first attempt. The retry has one price: a hash of a password of exactly 72 bytes also accepts that
 *   password followed by anything, the way bcrypt itself always has.
 */
export class CredentialHelper {
  /**
   * A hash of `password`: argon2id by default (Bun's default parameters), bcrypt with `algorithm: 'bcrypt'`.
   * For bcrypt, `cost` (4 to 31, default 10) is the work factor, `2 ** cost` rounds. `cost` with argon2id
   * is refused rather than ignored: a caller who tuned a cost is told the default changed.
   */
  static async hash(opts: {
    password: string;
    algorithm?: TCredentialAlgorithm;
    cost?: number;
  }): Promise<string> {
    const { password, algorithm = DEFAULT_CREDENTIAL_ALGORITHM, cost } = opts;

    CredentialHelper.assertBun({ caller: 'hash' });

    if (typeof password !== 'string' || password.length === 0) {
      throw getError({
        message: '[CredentialHelper.hash] Invalid password | Expected a non-empty string',
      });
    }

    if (typeof algorithm !== 'string' || !CredentialAlgorithms.isValid(algorithm)) {
      throw getError({
        message: `[CredentialHelper.hash] Invalid algorithm | Expected one of ${[...CredentialAlgorithms.SCHEME_SET].join(', ')} | Got: ${String(algorithm)}`,
      });
    }

    if (algorithm === CredentialAlgorithms.ARGON2ID) {
      if (cost !== undefined && cost !== null) {
        throw getError({
          message: `[CredentialHelper.hash] Invalid cost | cost applies to bcrypt only | Pass algorithm: 'bcrypt' to keep a bcrypt cost, or drop cost for argon2id`,
        });
      }

      return Bun.password.hash(password, { algorithm: 'argon2id' });
    }

    const bcryptCost = cost ?? DEFAULT_COST;

    if (!Number.isInteger(bcryptCost) || bcryptCost < MIN_COST || bcryptCost > MAX_COST) {
      throw getError({
        message: `[CredentialHelper.hash] Invalid cost | Expected an integer from ${MIN_COST} to ${MAX_COST} | Got: ${bcryptCost}`,
      });
    }

    return Bun.password.hash(password, { algorithm: 'bcrypt', cost: bcryptCost });
  }

  /**
   * Whether `password` matches `hash`. Nothing to match is `false`: an empty or non-string password, an empty
   * or non-string hash. A stored value that is not a password hash is a server fault (500), so a corrupt row is
   * never answered like a wrong password, and the runtime's own message stays out of it.
   */
  static async verify(opts: { password: string; hash: string }): Promise<boolean> {
    const { password, hash } = opts;

    CredentialHelper.assertBun({ caller: 'verify' });

    if (typeof password !== 'string' || password.length === 0) {
      return false;
    }

    if (typeof hash !== 'string' || hash.length === 0) {
      return false;
    }

    const matched = await CredentialHelper.verifyHash({ password, hash });

    if (matched || !BCRYPT_PREFIX.test(hash)) {
      return matched;
    }

    const bytes = Buffer.from(password, 'utf8');

    if (bytes.length <= BCRYPT_MAX_PASSWORD_BYTES) {
      return false;
    }

    return CredentialHelper.verifyHash({
      password: bytes.subarray(0, BCRYPT_MAX_PASSWORD_BYTES),
      hash,
    });
  }

  private static async verifyHash(opts: {
    password: string | Uint8Array;
    hash: string;
  }): Promise<boolean> {
    const { password, hash } = opts;

    try {
      const matched = await Bun.password.verify(password, hash);

      return matched;
    } catch (error) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[CredentialHelper.verify] Invalid hash | The stored value is not a password hash',
        cause: error,
      });
    }
  }

  private static assertBun(opts: { caller: string }): void {
    if (typeof Bun === 'undefined') {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[CredentialHelper.${opts.caller}] Unsupported runtime | CredentialHelper needs Bun.password`,
      });
    }
  }
}
