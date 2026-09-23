import type { ITemporalNamespace } from '../common/types';

/** A `Temporal` namespace - the runtime's global or a polyfill's - by the one member the adapter drives. */
export const isTemporalNamespace = (value: unknown): value is ITemporalNamespace => {
  if (typeof value !== 'object' || value === null || !('Instant' in value)) {
    return false;
  }

  const instant = value.Instant;
  return (
    (typeof instant === 'function' || (typeof instant === 'object' && instant !== null)) &&
    typeof Reflect.get(instant, 'fromEpochMilliseconds') === 'function'
  );
};
