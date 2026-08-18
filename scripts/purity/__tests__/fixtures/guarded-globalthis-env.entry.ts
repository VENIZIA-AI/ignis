// The safe counterpart of impure-globalthis-env.entry.ts, and the form three helpers/inversion
// modules already ship into the kernel bundle. `globalThis.process` is an ordinary property read
// that yields `undefined` in a browser, so the optional chain short-circuits instead of throwing.
// The gate reports it and stays green.
export const getMode = (): string => {
  return globalThis.process?.env?.NODE_ENV ?? 'unknown';
};
