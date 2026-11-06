/** How deep an `and` / `or` nesting may go before a `where` is refused. Real filters stay in single digits. */
export const DEFAULT_MAX_WHERE_DEPTH = 20;

/**
 * Measures the nesting of a `where` BEFORE the recursive schema walks it: the schema's own cost grows with the square of the
 * depth, so a request must be refused on its depth, not after it has been parsed. The measure is iterative, with no
 * recursion of its own, and stops as soon as the limit is passed.
 */
export class WhereDepthGuard {
  /** True when `value` nests `and` / `or` groups deeper than `max` (a flat `where` is depth 1). */
  static exceeds(opts: { value: unknown; max: number }): boolean {
    const { value, max } = opts;
    const stack: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 1 }];

    while (stack.length > 0) {
      const { node, depth } = stack.pop() as { node: unknown; depth: number };

      if (typeof node !== 'object' || node === null || Array.isArray(node)) {
        continue;
      }

      if (depth > max) {
        return true;
      }

      for (const key of ['and', 'or'] as const) {
        const branches = (node as Record<string, unknown>)[key];

        if (Array.isArray(branches)) {
          for (const branch of branches) {
            stack.push({ node: branch, depth: depth + 1 });
          }
        }
      }
    }

    return false;
  }
}
