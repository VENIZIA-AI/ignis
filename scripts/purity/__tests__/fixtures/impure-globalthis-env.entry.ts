// Review finding: the `process` pattern's lookbehind rejects a preceding dot, so by construction it
// can never see this form. The read throws a TypeError in a browser - `globalThis.process` is
// `undefined` there and `.env` on it fails - so it is exactly as fatal as a bare `process.env`.
export const getMode = (): string => {
  return globalThis.process.env.NODE_ENV ?? 'unknown';
};
