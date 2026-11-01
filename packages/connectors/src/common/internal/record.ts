export class RecordUtility {
  /** A non-null object, arrays included: the narrowest check before reading string keys off an `unknown` wire payload. A type guard, so it keeps its positional `value`. */
  static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
