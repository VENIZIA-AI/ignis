/**
 * The status codes, and nothing else: `Statuses` and `CommonStatuses` import nothing, so a browser bundle
 * that needs a status constant takes this entry instead of the server kernel.
 *
 * Weight is a contract, checked by `src/__tests__/bundle/browser-weight.test.ts`.
 */

export { CommonStatuses, Statuses } from '@/common/statuses/common';
