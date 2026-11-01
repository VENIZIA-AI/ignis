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
