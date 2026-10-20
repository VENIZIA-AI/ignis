import { HTTP } from '@/common/constants';
import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-inversion';
import { ErrorScopes } from '@venizia/ignis-inversion';

/**
 * A url the policy refuses is refused forever - the same url will never be allowed. A caller that
 * retries on failure has to tell that apart from a host that timed out, or it retries a rejection
 * and turns the guard into a repeat scanner.
 */
export const UrlSafetyErrors = {
  URL_REFUSED: {
    message: { text: 'Url refused by the safety policy', code: 'core.url_safety.url_refused' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.BUSINESS,
  },
} as const satisfies Record<string, TErrorDefinition>;

declare module '@venizia/ignis-inversion' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof UrlSafetyErrors> {}
}

/**
 * True when the url will never be allowed, whatever happens next: a bad scheme, a non-public
 * address, a host outside the allow-list, a malformed url, or too many hops. Retrying any of those
 * repeats the same rejection - drop the work instead.
 *
 * A timeout, a DNS failure or a 5xx answers `false`: those are worth another attempt.
 */
export const isUrlRefusedError = (opts: { error: unknown }): boolean => {
  const source = opts.error as { normalized?: { code?: string } };
  return source?.normalized?.code === UrlSafetyErrors.URL_REFUSED.message.code;
};
