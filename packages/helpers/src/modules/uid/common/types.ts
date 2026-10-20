import type { ValueOrPromise } from '@/common/types';
import type { TUidCaseForm } from './constants';

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

export interface IOpaqueUidOptions {
  /** Defaults to disabled. */
  prefix?: IUidSegment;

  /** Defaults to disabled, with `_` ready. Meaningless without a prefix, and refused there. */
  delimiter?: IUidSegment;

  /** Characters in the BODY. The prefix and the delimiter are not counted. */
  length?: number;

  /** Defaults to `upper` - the alphabet default is uppercase-only, so anything else would widen it. */
  caseForm?: TUidCaseForm;

  /** Defaults to `UidAlphabets.CROCKFORD`. */
  alphabet?: string;

  /** Removed from `alphabet` on top of whatever the set already drops. */
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

  /** Draws before giving up, when `isAvailable` is supplied. Defaults to {@link DEFAULT_UID_MAX_ATTEMPTS}. */
  maxAttempts?: number;
}
