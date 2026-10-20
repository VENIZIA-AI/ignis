import { HTTP } from '@/common/constants';
import type { ValueOrPromise } from '@/common/types';
import { BaseHelper } from '../base';
import { getError } from '../error';
import {
  DEFAULT_UID_DELIMITER,
  DEFAULT_UID_LENGTH,
  DEFAULT_UID_MAX_ATTEMPTS,
  MIN_UID_ALPHABET_SIZE,
  UidAlphabets,
  UidCaseForms,
} from './common/constants';
import type { TUidCaseForm } from './common/constants';
import type { INextOpaqueUidOptions, IOpaqueUidOptions, IUidSegment } from './common/types';

/** How many random bytes to draw per refill, per remaining character. Rejection throws some away, so asking for exactly `length` would round-trip to the entropy source repeatedly. */
const SAMPLING_OVERDRAW = 2;

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

  /** Rejection mask: the smallest `2^n - 1` that covers every alphabet index. A plain `byte % size` would favour the first `256 % size` characters, which is a bias a caller cannot see and cannot undo. */
  private readonly mask: number;

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

    this.prefix = OpaqueUidHelper.resolvePrefix({ prefix: opts?.prefix, caseForm });
    this.delimiter = OpaqueUidHelper.resolveDelimiter({
      delimiter: opts?.delimiter,
      hasPrefix: this.prefix.length > 0,
      alphabet: this.alphabet,
    });

    this.mask = (1 << Math.ceil(Math.log2(this.alphabet.length))) - 1;
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

    if (await verdict) {
      return id;
    }

    for (let next = attempt + 1; next <= maxAttempts; next++) {
      const candidate = `${head}${this.randomBody()}`;

      if (await isAvailable(candidate)) {
        return candidate;
      }
    }

    throw this.buildExhaustedError({ maxAttempts });
  }

  private resolveHead(opts: { prefix?: string }): string {
    const override = opts.prefix;

    if (override === '') {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${OpaqueUidHelper.name}][nextId] An empty prefix is not how a prefix is turned off | Construct with \`prefix: { enable: false }\``,
      });
    }

    const prefix = override ?? this.prefix;
    return prefix.length > 0 ? `${prefix}${this.delimiter}` : '';
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
    const size = this.alphabet.length;
    let body = '';

    while (body.length < this.length) {
      const bytes = OpaqueUidHelper.randomBytes({
        count: (this.length - body.length) * SAMPLING_OVERDRAW,
      });

      for (const byte of bytes) {
        const index = byte & this.mask;

        // Rejection, not wrap-around: an index past the alphabet is discarded so every character
        // stays equally likely.
        if (index >= size) {
          continue;
        }

        body += this.alphabet[index];
        if (body.length === this.length) {
          break;
        }
      }
    }

    return body;
  }

  /**
   * `crypto.getRandomValues`, never `Math.random`. Unlike `crypto.randomUUID`, this one is NOT
   * restricted to a secure context, so it works on a plain-http origin and inside a browser Worker.
   */
  private static randomBytes(opts: { count: number }): Uint8Array {
    const source = globalThis.crypto;

    if (typeof source?.getRandomValues !== 'function') {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${OpaqueUidHelper.name}] No Web Crypto available | \`crypto.getRandomValues\` is required and \`Math.random\` is not an acceptable substitute for an identifier`,
      });
    }

    return source.getRandomValues(new Uint8Array(opts.count));
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
    const resolved = [...new Set(folded)].filter(character => !removed.has(character)).join('');

    if (resolved.length < MIN_UID_ALPHABET_SIZE) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${OpaqueUidHelper.name}] Alphabet too small | size: ${resolved.length} | minimum: ${MIN_UID_ALPHABET_SIZE} | Widen \`alphabet\` or shorten \`exclude\``,
      });
    }

    return resolved;
  }

  /** An enabled prefix in the wrong case defeats the reason for choosing one: an id meant to survive a case-insensitive column stops being one the moment its prefix disagrees. */
  private static resolvePrefix(opts: { prefix?: IUidSegment; caseForm: TUidCaseForm }): string {
    const { prefix, caseForm } = opts;

    if (!prefix?.enable) {
      return '';
    }

    const value = prefix.value ?? '';
    if (value.length === 0) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${OpaqueUidHelper.name}] prefix is enabled but carries no value`,
      });
    }

    const expected =
      caseForm === UidCaseForms.UPPER
        ? value.toUpperCase()
        : caseForm === UidCaseForms.LOWER
          ? value.toLowerCase()
          : value;

    if (value !== expected) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${OpaqueUidHelper.name}] prefix does not match caseForm | prefix: ${value} | caseForm: ${caseForm} | expected: ${expected}`,
      });
    }

    return value;
  }

  /**
   * Two refusals here, both because the alternative fails silently: a delimiter with no prefix is a
   * leading character that separates nothing, and a delimiter drawn from the alphabet makes the id
   * impossible to split back into prefix and body.
   */
  private static resolveDelimiter(opts: {
    delimiter?: IUidSegment;
    hasPrefix: boolean;
    alphabet: string;
  }): string {
    const { delimiter, hasPrefix, alphabet } = opts;

    if (!delimiter?.enable) {
      return '';
    }

    if (!hasPrefix) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${OpaqueUidHelper.name}] delimiter is enabled without a prefix | It would lead the id and separate nothing | Put the character in \`prefix.value\` if that is what you want`,
      });
    }

    const value = delimiter.value ?? DEFAULT_UID_DELIMITER;
    if (value.length === 0) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${OpaqueUidHelper.name}] delimiter is enabled but carries no value`,
      });
    }

    const shared = [...new Set(value)].filter(character => alphabet.includes(character));
    if (shared.length > 0) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${OpaqueUidHelper.name}] delimiter shares characters with the alphabet | shared: ${shared.join('')} | An id built with it cannot be split back into prefix and body`,
      });
    }

    return value;
  }
}
