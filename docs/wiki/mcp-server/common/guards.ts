/**
 * Everything this server reads is external and untyped - markdown frontmatter, GitHub error bodies,
 * npm registry responses. A key may be absent, of the wrong type, or PRESENT BUT EMPTY, and an empty
 * value has to fall back exactly like a missing one. That is a truthiness test, not a nullish one,
 * which is why these call sites cannot use `??`.
 */
export const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.length > 0;
};
