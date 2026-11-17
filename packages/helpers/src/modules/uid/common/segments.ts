import { HTTP } from '@/common/constants';
import { getError } from '../../error';
import { DEFAULT_UID_DELIMITER, UidCaseForms } from './constants';
import type { TUidCaseForm } from './constants';
import type { IUidSegment } from './types';

/**
 * The prefix and delimiter rules every prefixed id shares, so `OpaqueUidHelper` and
 * `TokenUidHelper` refuse the same things for the same reasons. Internal: not exported from the
 * barrel. `scope` is the calling helper's name, which is what an error message leads with.
 */
export class UidSegments {
  /** An enabled prefix in the wrong case defeats the reason for choosing one: an id meant to survive a case-insensitive column stops being one the moment its prefix disagrees. */
  static resolvePrefix(opts: {
    scope: string;
    prefix?: IUidSegment;
    caseForm: TUidCaseForm;
  }): string {
    const { scope, prefix, caseForm } = opts;

    if (!prefix?.enable) {
      return '';
    }

    const value = prefix.value ?? '';

    if (value.length === 0) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] prefix is enabled but carries no value`,
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
        message: `[${scope}] prefix does not match caseForm | prefix: ${value} | caseForm: ${caseForm} | expected: ${expected}`,
      });
    }

    return value;
  }

  /**
   * Two refusals here, both because the alternative fails silently: a delimiter with no prefix is a
   * leading character that separates nothing, and a delimiter drawn from the alphabet makes the id
   * impossible to split back into prefix and body.
   */
  static resolveDelimiter(opts: {
    scope: string;
    delimiter?: IUidSegment;
    hasPrefix: boolean;
    alphabet: string;
    /** Appended to the refusal that names shared characters, for a caller who can act on it. */
    hint?: string;
  }): string {
    const { scope, delimiter, hasPrefix, alphabet, hint } = opts;

    if (!delimiter?.enable) {
      return '';
    }

    if (!hasPrefix) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] delimiter is enabled without a prefix | It would lead the id and separate nothing | Put the character in \`prefix.value\` if that is what you want`,
      });
    }

    const value = delimiter.value ?? DEFAULT_UID_DELIMITER;

    if (value.length === 0) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] delimiter is enabled but carries no value`,
      });
    }

    const shared = [...new Set(value)].filter((character) => alphabet.includes(character));

    if (shared.length > 0) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}] delimiter shares characters with the alphabet | shared: ${shared.join('')} | An id built with it cannot be split back into prefix and body${hint ? ` | ${hint}` : ''}`,
      });
    }

    return value;
  }

  /** The text in front of the body: the per-call `override` or the configured `prefix`, then the delimiter. Empty when there is no prefix. */
  static resolveHead(opts: {
    scope: string;
    override?: string;
    prefix: string;
    delimiter: string;
  }): string {
    const { scope, override, delimiter } = opts;

    if (override === '') {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${scope}][nextId] An empty prefix is not how a prefix is turned off | Construct with \`prefix: { enable: false }\``,
      });
    }

    const prefix = override ?? opts.prefix;

    return prefix.length > 0 ? `${prefix}${delimiter}` : '';
  }
}
