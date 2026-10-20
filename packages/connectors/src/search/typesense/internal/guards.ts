export interface IHttpLikeError {
  httpStatus?: number;
  message?: string;
}

// Narrow runtime readers for the `unknown` payloads ITypesenseClientLike hands back - the narrowest cast per field, isolated here instead of repeated ad hoc at every call site.
export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

export const readBooleanFlag = (opts: { value: unknown; key: string }): boolean => {
  const { value, key } = opts;
  return isRecord(value) ? Boolean(value[key]) : false;
};

export const readNumberField = (opts: { value: unknown; key: string }): number => {
  const { value, key } = opts;
  if (!isRecord(value) || typeof value[key] !== 'number') {
    return 0;
  }
  return value[key];
};

export const readStringField = (opts: { value: unknown; key: string }): string | undefined => {
  const { value, key } = opts;
  if (!isRecord(value) || typeof value[key] !== 'string') {
    return undefined;
  }
  return value[key];
};
