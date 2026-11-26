import { RecordUtility } from '@venizia/ignis-helpers/core';
import type {
  IBffErrorEnvelope,
  IBffRequestEnvelope,
  IBffResponseEnvelope,
  TEnvelopeHeaders,
} from './common';

/** Reads what arrived by `postMessage` or a `BroadcastChannel`: another tab or an older build can send anything. Type guards, so they keep their positional `data`. */
export class BffEnvelopeGuard {
  /** The `id` of a message that carries one. Without it, no caller can be answered. */
  static readId(data: unknown): string | undefined {
    return RecordUtility.isRecord(data) && typeof data.id === 'string' && data.id.length > 0
      ? data.id
      : undefined;
  }

  static isRequest(data: unknown): data is IBffRequestEnvelope {
    return (
      RecordUtility.isRecord(data) &&
      BffEnvelopeGuard.readId(data) !== undefined &&
      typeof data.method === 'string' &&
      typeof data.url === 'string' &&
      BffEnvelopeGuard.isHeaders(data.headers) &&
      BffEnvelopeGuard.isBody(data.body)
    );
  }

  static isResponse(data: unknown): data is IBffResponseEnvelope {
    return (
      RecordUtility.isRecord(data) &&
      BffEnvelopeGuard.readId(data) !== undefined &&
      typeof data.status === 'number' &&
      (data.statusText === undefined || typeof data.statusText === 'string') &&
      BffEnvelopeGuard.isHeaders(data.headers) &&
      BffEnvelopeGuard.isBody(data.body)
    );
  }

  /** `args` is not checked: the type leaves it `unknown`. */
  static isError(data: unknown): data is IBffErrorEnvelope {
    return (
      RecordUtility.isRecord(data) &&
      BffEnvelopeGuard.readId(data) !== undefined &&
      typeof data.statusCode === 'number' &&
      RecordUtility.isRecord(data.error) &&
      typeof data.error.text === 'string' &&
      (data.error.code === undefined || typeof data.error.code === 'string')
    );
  }

  private static isHeaders(value: unknown): value is TEnvelopeHeaders {
    return (
      Array.isArray(value) &&
      value.every(
        (entry) =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          typeof entry[0] === 'string' &&
          typeof entry[1] === 'string',
      )
    );
  }

  private static isBody(value: unknown): value is ArrayBuffer | undefined {
    return value === undefined || value instanceof ArrayBuffer;
  }
}
