const droppedRouteDecorators: Array<string> = [];
let isReported = false;

/** True for the legacy (`experimentalDecorators`) call shape - under TC39 semantics decorators get `(method, context)` with no prototype to attach metadata to, so the route silently 404s; the drop is recorded instead for {@link reportDroppedRouteDecorators} to report at configure() time, since importing a module must stay free of side effects. */
export const isLegacyMethodDecoratorCall = (opts: {
  decorator: string;
  propertyKey: unknown;
}): opts is { decorator: string; propertyKey: string | symbol } => {
  const { decorator, propertyKey } = opts;

  if (typeof propertyKey === 'string' || typeof propertyKey === 'symbol') {
    return true;
  }

  const methodName = (propertyKey as { name?: string })?.name ?? 'unknown';
  droppedRouteDecorators.push(`@${decorator} ${methodName}`);
  return false;
};

/** Warns once per process about every route/rpc decorator this runtime dropped. */
export const reportDroppedRouteDecorators = (opts: {
  logger: { warn: (message: string, ...args: Array<unknown>) => void };
}): void => {
  if (isReported || droppedRouteDecorators.length === 0) {
    return;
  }

  isReported = true;
  opts.logger.warn(
    'IGNORED | %s route/rpc decorator(s) were compiled with TC39 semantics and could NOT be registered - their endpoints will 404 | Enable "experimentalDecorators" in the tsconfig your runtime actually resolves (a tsconfig whose "extends" chain the runtime cannot resolve is discarded whole) | dropped: %s',
    droppedRouteDecorators.length,
    droppedRouteDecorators.join(', '),
  );
};

/** @internal Test seam: every route/rpc decorator the runtime has dropped so far. */
export const getDroppedRouteDecorators = (): Array<string> => {
  return [...droppedRouteDecorators];
};
