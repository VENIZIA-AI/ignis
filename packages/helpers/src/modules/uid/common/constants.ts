import { TConstValue } from '@/common/types';

// -------------------------------------------------------------
/**
 * Which characters an id may be built from. Every set here drops the pairs that collide in common
 * fonts - zero against capital O, one against capital I and lowercase L - so a human copying an id
 * off a screen cannot produce a different one.
 */
export class UidAlphabets {
  /** Digits and both cases, nothing removed. Densest, and the only set here a human should not be asked to read. */
  static readonly BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  /** BASE62 minus `0`, `O`, `I`, `l`. 58 characters - the Bitcoin/Stripe-shaped alphabet. */
  static readonly BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  /** Crockford's base32: uppercase only, without `I`, `L`, `O` (ambiguous) and `U` (so no word can read as an obscenity). Case-insensitive by construction, which is what makes it safe in a CI column or a hostname. */
  static readonly CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  /** BASE58 without vowels, so no real word - and no accidental obscenity - can form. 50 characters. */
  static readonly NO_VOWEL = '123456789BCDFGHJKLMNPQRSTVWXYZbcdfghjkmnpqrstvwxyz';
}

// -------------------------------------------------------------
/**
 * Whether an id mixes letter cases. Applied to the ALPHABET before sampling, never to the finished
 * string: folding the output would silently halve the entropy the caller thinks they asked for, and
 * would fold an excluded character back in - uppercasing a lowercase alphabet reintroduces `I` and
 * `O` that {@link UidAlphabets} took out.
 */
export class UidCaseForms {
  static readonly UPPER = 'upper';
  static readonly LOWER = 'lower';
  static readonly MIXED = 'mixed';

  static readonly SCHEME_SET = new Set([this.UPPER, this.LOWER, this.MIXED]);

  static isValid(input: string): input is TUidCaseForm {
    return this.SCHEME_SET.has(input);
  }
}

export type TUidCaseForm = TConstValue<typeof UidCaseForms>;

// -------------------------------------------------------------
/**
 * Six characters of {@link UidAlphabets.CROCKFORD} is 2^30 combinations, which is an airline record
 * locator - and it works for the same three reasons, not because 2^30 is large:
 *
 * 1. SCOPED. A record locator is unique per carrier, not worldwide. Use `prefix` per entity type so
 *    each kind of id gets its own space.
 * 2. RECYCLED. Airlines reuse a locator once the trip is over.
 * 3. RETRIED. The reservation system regenerates on conflict.
 *
 * Measured, so nobody has to guess: a 1% chance of at least one collision arrives at roughly 4,600
 * ids in ONE space, and 50% at roughly 38,000.
 *
 * A `prefix` PARTITIONS the space - `INV-7K2MQ9` cannot collide with `CUS-7K2MQ9` - so each entity
 * type gets its own. It does NOT make an id unique inside that space, and no length does: this
 * generator is probabilistic by construction. The column needs a unique index, and the insert needs
 * to regenerate on violation rather than checking first, which races.
 */
export const DEFAULT_UID_LENGTH = 6;

/** Below this an `exclude` list has eaten the alphabet, and the ids stop being ids. */
export const MIN_UID_ALPHABET_SIZE = 16;

/** Draws allowed when an `isAvailable` check keeps rejecting. Bounded rather than endless: a space with no room left would otherwise hang the caller instead of telling them. */
export const DEFAULT_UID_MAX_ATTEMPTS = 10;

/** Separates the prefix from the body when both are enabled. Not in any {@link UidAlphabets} set, so an id splits back apart cleanly. */
export const DEFAULT_UID_DELIMITER = '_';
