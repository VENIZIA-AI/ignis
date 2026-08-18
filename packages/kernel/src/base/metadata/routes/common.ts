/** Records the route/rpc decorators this runtime dropped, and warns about them once. Importing a module must stay side-effect free, so the drop is recorded at decoration time and reported later, at configure(). */
export class DroppedRouteDecorators {
  private static readonly dropped: Array<string> = [];
  private static isReported = false;

  /** True for the legacy (`experimentalDecorators`) call shape - under TC39 semantics decorators get `(method, context)` with no prototype to attach metadata to, so the route silently 404s; the drop is recorded instead. */
  static isLegacyCall(opts: {
    decorator: string;
    propertyKey: unknown;
  }): opts is { decorator: string; propertyKey: string | symbol } {
    const { decorator, propertyKey } = opts;

    if (typeof propertyKey === 'string' || typeof propertyKey === 'symbol') {
      return true;
    }

    const methodName = (propertyKey as { name?: string })?.name ?? 'unknown';
    DroppedRouteDecorators.dropped.push(`@${decorator} ${methodName}`);
    return false;
  }

  /** Warns once per process about every route/rpc decorator this runtime dropped. */
  static report(opts: {
    logger: { warn: (message: string, ...args: Array<unknown>) => void };
  }): void {
    if (DroppedRouteDecorators.isReported || DroppedRouteDecorators.dropped.length === 0) {
      return;
    }

    DroppedRouteDecorators.isReported = true;
    opts.logger.warn(
      'IGNORED | %s route/rpc decorator(s) were compiled with TC39 semantics and could NOT be registered - their endpoints will 404 | Enable "experimentalDecorators" in the tsconfig your runtime actually resolves (a tsconfig whose "extends" chain the runtime cannot resolve is discarded whole) | dropped: %s',
      DroppedRouteDecorators.dropped.length,
      DroppedRouteDecorators.dropped.join(', '),
    );
  }

  /** @internal Test seam: every route/rpc decorator the runtime has dropped so far. */
  static list(): Array<string> {
    return [...DroppedRouteDecorators.dropped];
  }
}

/** @internal Published name of {@link DroppedRouteDecorators.list} - the one core test that reaches it can only do so through the package barrel. */
export const getDroppedRouteDecorators = (): Array<string> => DroppedRouteDecorators.list();
