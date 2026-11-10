import { HTTP } from '@/common/constants';
import type { ValueOrPromise } from '@/common/types';
import { BaseHelper } from '../base';
import { getError } from '../error';
import {
  DEFAULT_UID_LENGTH,
  DEFAULT_UID_MAX_ATTEMPTS,
  MIN_UID_ALPHABET_SIZE,
  UidAlphabets,
  UidCaseForms,
} from './common/constants';
import type { TUidCaseForm } from './common/constants';
import { UidRandom } from './common/random';
import { UidSegments } from './common/segments';
import type { INextOpaqueUidOptions, IOpaqueUidOptions } from './common/types';

/** Local, not `@/utilities/promise.utility`: that module imports the logger BARREL, which reaches `node:module` and would take this browser-pure module with it. */
const isPromiseLike = (value: unknown): value is PromiseLike<boolean> => {
  return typeof (value as PromiseLike<boolean> | null | undefined)?.then === 'function';
};

/**
 * Fixed-length opaque ids, optionally prefixed - the counterpart to `SnowflakeUidHelper`.
 *
 * OPAQUE is the difference that matters, not the randomness. A Snowflake id is TRANSPARENT: its own
 * `parseId()` reads back the exact millisecond it was minted and the worker that minted it. That is
 * what you want in a log and not what you want on an invoice. Nothing can be read out of an id from
 * here. The cost is the ordering, which a Snowflake gives an index for free.
 *
 * `length` counts the BODY only. A prefix and a delimiter sit in front of it, so the finished string
 * is `prefix + delimiter + length` characters.
 *
 * Read {@link DEFAULT_UID_LENGTH} before accepting the default: six characters is an airline record
 * locator, and it needs the same scoping and retry that airlines give one.
 */
export class OpaqueUidHelper extends BaseHelper {
  private readonly alphabet: string;
  private readonly length: number;
  private readonly prefix: string;
  private readonly delimiter: string;

  constructor(opts?: IOpaqueUidOptions) {
    super({ scope: OpaqueUidHelper.name });

    const caseForm = opts?.caseForm ?? UidCaseForms.UPPER;
    OpaqueUidHelper.assertKnownCaseForm({ caseForm });

    this.alphabet = OpaqueUidHelper.resolveAlphabet({
      alphabet: opts?.alphabet ?? UidAlphabets.CROCKFORD,
      exclude: opts?.exclude ?? '',
      caseForm,
    });

    this.length = opts?.length ?? DEFAULT_UID_LENGTH;

    if (!Number.isInteger(this.length) || this.length < 1) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${OpaqueUidHelper.name}] length must be a positive integer | value: ${this.length}`,
      });
    }

    this.prefix = UidSegments.resolvePrefix({
      scope: OpaqueUidHelper.name,
      prefix: opts?.prefix,
      caseForm,
    });
    this.delimiter = UidSegments.resolveDelimiter({
      scope: OpaqueUidHelper.name,
      delimiter: opts?.delimiter,
      hasPrefix: this.prefix.length > 0,
      alphabet: this.alphabet,
    });
  }

  /**
   * `prefix` replaces the configured value for this call and turns the prefix on for it; the
   * delimiter follows its own switch.
   *
   * `isAvailable` redraws until it accepts an id, up to `maxAttempts`. It LOWERS the collision rate,
   * it does not remove it: against a database the check and the insert are two statements, and
   * another request can take the id in between. The column still needs a unique index, and the
   * insert still needs to regenerate on violation.
   */
  nextId(opts?: INextOpaqueUidOptions<boolean>): string;
  nextId(opts: INextOpaqueUidOptions<Promise<boolean>>): Promise<string>;
  nextId(opts: INextOpaqueUidOptions): ValueOrPromise<string>;
  nextId(opts?: INextOpaqueUidOptions): ValueOrPromise<string> {
    const head = this.resolveHead({ prefix: opts?.prefix });

    const isAvailable = opts?.isAvailable;

    if (!isAvailable) {
      // Refused rather than ignored: without a check there is exactly ONE draw, so a caller who set
      // `maxAttempts` has configured a retry that cannot happen and has no way to notice.
      if (opts?.maxAttempts !== undefined) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[${OpaqueUidHelper.name}][nextId] maxAttempts has no effect without \`isAvailable\` | Nothing rejects a draw, so there is only ever one`,
        });
      }

      return `${head}${this.randomBody()}`;
    }

    const maxAttempts = OpaqueUidHelper.resolveMaxAttempts({ maxAttempts: opts?.maxAttempts });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const id = `${head}${this.randomBody()}`;
      const verdict = isAvailable(id);

      // The first PENDING verdict decides the shape of the whole call. Everything before it already
      // resolved, so a synchronous check never allocates a promise and `nextId()` stays a string.
      if (isPromiseLike(verdict)) {
        return this.continueAsync({ head, isAvailable, maxAttempts, attempt, id, verdict });
      }

      if (verdict) {
        return id;
      }
    }

    throw this.buildExhaustedError({ maxAttempts });
  }

  /** Entered only once a verdict came back pending; every later draw is awaited from here. */
  private async continueAsync(opts: {
    head: string;
    isAvailable: (id: string) => ValueOrPromise<boolean>;
    maxAttempts: number;
    attempt: number;
    id: string;
    verdict: PromiseLike<boolean>;
  }): Promise<string> {
    const { head, isAvailable, maxAttempts, attempt, id, verdict } = opts;

    const result = await verdict;

    if (result) {
      return id;
    }

    for (let next = attempt + 1; next <= maxAttempts; next++) {
      const candidate = `${head}${this.randomBody()}`;

      const result2 = await isAvailable(candidate);

      if (result2) {
        return candidate;
      }
    }

    throw this.buildExhaustedError({ maxAttempts });
  }

  private resolveHead(opts: { prefix?: string }): string {
    return UidSegments.resolveHead({
      scope: OpaqueUidHelper.name,
      override: opts.prefix,
      prefix: this.prefix,
      delimiter: this.delimiter,
    });
  }

  private static resolveMaxAttempts(opts: { maxAttempts?: number }): number {
    const maxAttempts = opts.maxAttempts ?? DEFAULT_UID_MAX_ATTEMPTS;

    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${OpaqueUidHelper.name}][nextId] maxAttempts must be a positive integer | value: ${maxAttempts}`,
      });
    }

    return maxAttempts;
  }

  /** Bounded rather than endless: repeated rejection means the space is full, and a caller waiting forever learns that far later than a caller holding this error. */
  private buildExhaustedError(opts: { maxAttempts: number }) {
    return getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[${OpaqueUidHelper.name}][nextId] No available id after ${opts.maxAttempts} attempts | length: ${this.length} | alphabet: ${this.alphabet.length} | The space is crowded - raise \`length\``,
    });
  }

  /** The alphabet actually in use, after the case fold and every exclusion - what `length` is measured against. */
  getAlphabet(): string {
    return this.alphabet;
  }

  private randomBody(): string {
    return UidRandom.sample({ alphabet: this.alphabet, length: this.length });
  }

  private static hasBothCases(opts: { alphabet: string }): boolean {
    let hasUpper = false;
    let hasLower = false;

    for (const character of opts.alphabet) {
      hasUpper ||= character !== character.toLowerCase();
      hasLower ||= character !== character.toUpperCase();

      if (hasUpper && hasLower) {
        return true;
      }
    }

    return false;
  }

  private static assertKnownCaseForm(opts: { caseForm: TUidCaseForm }): void {
    if (UidCaseForms.isValid(opts.caseForm)) {
      return;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[${OpaqueUidHelper.name}] Unknown caseForm | value: ${opts.caseForm} | valid: ${[...UidCaseForms.SCHEME_SET].join(', ')}`,
    });
  }

  /**
   * Folds case FIRST, then excludes, then de-duplicates - folding after sampling would misreport the
   * entropy and undo the alphabet's own exclusions.
   *
   * Refuses to fold a two-case alphabet at all, because folding one puts back exactly what it took
   * out: uppercasing `BASE58` turns its lowercase letters into `I` and `O`, the two it drops to keep
   * `1` and `0` unambiguous, and lowercasing it brings back `l`. Measured - the result is 35
   * characters, not the 33 an entropy calculation would predict. A single-case alphabet folds
   * cleanly because there is nothing to collide with.
   */
  private static resolveAlphabet(opts: {
    alphabet: string;
    exclude: string;
    caseForm: TUidCaseForm;
  }): string {
    const { alphabet, exclude, caseForm } = opts;

    if (caseForm !== UidCaseForms.MIXED && OpaqueUidHelper.hasBothCases({ alphabet })) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${OpaqueUidHelper.name}] caseForm '${caseForm}' cannot fold a two-case alphabet | Folding reintroduces the characters the alphabet excluded | Use \`UidAlphabets.CROCKFORD\` for a single-case alphabet, or \`caseForm: '${UidCaseForms.MIXED}'\``,
      });
    }

    const folded =
      caseForm === UidCaseForms.UPPER
        ? alphabet.toUpperCase()
        : caseForm === UidCaseForms.LOWER
          ? alphabet.toLowerCase()
          : alphabet;

    const removed = new Set(exclude);
    const resolved = [...new Set(folded)].filter((character) => !removed.has(character)).join('');

    if (resolved.length < MIN_UID_ALPHABET_SIZE) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${OpaqueUidHelper.name}] Alphabet too small | size: ${resolved.length} | minimum: ${MIN_UID_ALPHABET_SIZE} | Widen \`alphabet\` or shorten \`exclude\``,
      });
    }

    return resolved;
  }
}
