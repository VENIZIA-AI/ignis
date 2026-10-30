import { RecordUtility } from '@/common/internal';

export interface IHttpLikeError {
  httpStatus?: number;
  message?: string;
}

// Narrow runtime readers for the `unknown` payloads ITypesenseClientLike hands back - the narrowest cast per field, isolated here instead of repeated ad hoc at every call site.
export class TypesensePayloadReader {
  static readBooleanFlag(opts: { value: unknown; key: string }): boolean {
    const { value, key } = opts;
    return RecordUtility.isRecord(value) ? Boolean(value[key]) : false;
  }

  static readNumberField(opts: { value: unknown; key: string }): number {
    const { value, key } = opts;
    if (!RecordUtility.isRecord(value) || typeof value[key] !== 'number') {
      return 0;
    }
    return value[key];
  }

  static readStringField(opts: { value: unknown; key: string }): string | undefined {
    const { value, key } = opts;
    if (!RecordUtility.isRecord(value) || typeof value[key] !== 'string') {
      return undefined;
    }
    return value[key];
  }
}
