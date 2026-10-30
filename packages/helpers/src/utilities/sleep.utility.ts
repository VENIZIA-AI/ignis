import { PromiseUtility } from './promise.utility';

/** @deprecated Use PromiseUtility.sleep({ ms }). Removed in 0.5. */
export const sleep = (ms: number) => {
  return PromiseUtility.sleep({ ms });
};
