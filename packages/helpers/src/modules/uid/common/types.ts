import type { ValueOrPromise } from '@/common/types';
import type { TUidCaseForm, TUidTokenEncoding } from './constants';

/**
 * A segment an id may or may not carry. `enable` decides; `value` survives being turned off, so a
 * caller can flip a configured delimiter back on without having to remember what it was.
 *
 * An empty string is NOT the off switch. That conflates "no prefix" with "a prefix I have not filled
 * in yet", and the second one is a bug worth reporting rather than silently accepting.
 */
export interface IUidSegment {
  enable: boolean;
  value?: string;
}

/** Options for generating an opaque id. Every field is optional. */
export interface IOpaqueUidOptions {
  /** @default { enable: false } */
  prefix?: IUidSegment;

  /**
   * Meaningless without a prefix, and refused there. Enabled without a `value`, it is {@link DEFAULT_UID_DELIMITER}.
   *
   * @default { enable: false }
   */
  delimiter?: IUidSegment;

  /**
   * Characters in the BODY. The prefix and the delimiter are not counted.
   *
   * @default DEFAULT_UID_LENGTH
   */
  length?: number;

  /**
   * Upper is the default because the default alphabet is uppercase-only, so anything else would widen it.
   *
   * @default UidCaseForms.UPPER
   */
  caseForm?: TUidCaseForm;

  /** @default UidAlphabets.CROCKFORD */
  alphabet?: string;

  /**
   * Removed from `alphabet` on top of whatever the set already drops.
   *
   * @default ''
   */
  exclude?: string;
}

/**
 * `TVerdict` is what `isAvailable` returns, and it decides what `nextId` returns: a synchronous
 * check keeps the call synchronous, an asynchronous one makes it a promise. See the overloads on
 * `OpaqueUidHelper.nextId`.
 */
export interface INextOpaqueUidOptions<
  TVerdict extends ValueOrPromise<boolean> = ValueOrPromise<boolean>,
> {
  /** Replaces the configured prefix for this call and turns it on. An empty string is refused - that is what the toggle is for. */
  prefix?: string;

  /**
   * Whether the drawn id may be used. `true` accepts it, `false` means taken and draws another.
   *
   * Named for what it RETURNS, not for the question it answers: an `exists` callback returning
   * `true` for a usable id is the sort of inverted polarity a reader gets wrong once and debugs for
   * an hour.
   *
   * An ASYNCHRONOUS check does not make an id safe. Against a database it is a read and then a
   * write with a gap in between, and another request can take the id inside that gap. It lowers the
   * collision rate; the unique index and the regenerate-on-violation insert are what remove it.
   */
  isAvailable?: (id: string) => TVerdict;

  /**
   * Draws before giving up, when `isAvailable` is supplied.
   *
   * @default DEFAULT_UID_MAX_ATTEMPTS
   */
  maxAttempts?: number;
}

/** Options for generating a secret token. Every field is optional. */
export interface ITokenUidOptions {
  /**
   * Random bytes before encoding. At least `MIN_TOKEN_BYTES`.
   *
   * @default DEFAULT_TOKEN_BYTES
   */
  bytes?: number;

  /** @default UidTokenEncodings.BASE62 */
  encoding?: TUidTokenEncoding;

  /** Same rules as {@link IOpaqueUidOptions.prefix}. @default { enable: false } */
  prefix?: IUidSegment;

  /**
   * Same rules as {@link IOpaqueUidOptions.delimiter}, checked against the characters of `encoding`:
   * `_` (the default) and `-` work with `base62` and `hex`. `base64url` holds both, so with it only a
   * character outside `A-Z a-z 0-9 - _` (for example `.`) is accepted.
   *
   * @default { enable: false }
   */
  delimiter?: IUidSegment;

  /**
   * Appends a fixed-width CRC-32 of the body, GitHub-style: 6 base62 characters (`base62`) or 8 hex
   * characters (`hex`). `isWellFormed` then rejects a mistyped token without a database lookup, and a
   * secret scanner can spot the token by its shape. Refused with `base64url`, whose alphabet has no
   * fixed width to give it. The checksum covers the body only, never the prefix.
   *
   * @default false
   */
  checksum?: boolean;
}

/** Per-call options of `TokenUidHelper.nextId`. */
export interface INextTokenUidOptions {
  /** Replaces the configured prefix for this call and turns it on. An empty string is refused. */
  prefix?: string;
}

/** Options for generating a numeric code. */
export interface INumericUidOptions {
  /**
   * Digits in the code. `10 ** length` must not exceed `2 ** 48`, so 14 at most.
   *
   * @default DEFAULT_NUMERIC_LENGTH
   */
  length?: number;
}
