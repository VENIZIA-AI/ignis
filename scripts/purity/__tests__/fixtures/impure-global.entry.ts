// No import at all - the leak is the global read, which bundles cleanly and is exactly what a
// specifier-only gate misses.
export const getMode = (): string => {
  return process.env.NODE_ENV ?? 'unknown';
};
