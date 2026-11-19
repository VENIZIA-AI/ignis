import { getError } from '@/modules/error';
import { UrlSafetyErrors } from '@/modules/network/utilities/url-safety/common/errors';

/** The largest body a call accepts when it names no `maxBytes` of its own. */
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/** A cap on a body, for a stream piped onward or a body read into memory. Browser-pure: streams and typed arrays only. */
export class BodyLimit {
  static readonly DEFAULT_MAX_BYTES = DEFAULT_MAX_BYTES;

  /** Enforces `maxBytes` on a stream nothing reads into this process: the cap fails the stream the moment the bytes cross it. */
  static capStream(opts: {
    source: ReadableStream<Uint8Array>;
    maxBytes?: number;
  }): ReadableStream<Uint8Array> {
    const { source } = opts;
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    let received = 0;

    return source.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength;

          if (received > maxBytes) {
            controller.error(
              getError({
                error: UrlSafetyErrors.URL_REFUSED,
                message: `[capStream] Body exceeds the cap | received: ${received} | max: ${maxBytes}`,
              }),
            );

            return;
          }

          controller.enqueue(chunk);
        },
      }),
    );
  }

  /** The size a response declares, or `0` when it declares none or an unreadable one. */
  static readDeclaredLength(opts: { headers: Headers }): number {
    const declared = Number(opts.headers.get('content-length') ?? 0);

    return Number.isFinite(declared) ? declared : 0;
  }

  /**
   * Reads a body that must not exceed `maxBytes`, cancelling the moment it does. `content-length` is checked first
   * because it is free, and counted anyway because it may be absent or lie.
   */
  static async readBytes(opts: { response: Response; maxBytes?: number }): Promise<Uint8Array> {
    const { response } = opts;
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    const declaredLength = BodyLimit.readDeclaredLength({ headers: response.headers });

    if (declaredLength > maxBytes) {
      await response.body?.cancel();
      throw getError({
        error: UrlSafetyErrors.URL_REFUSED,
        message: `[readBytes] Body exceeds the cap | declared: ${declaredLength} | max: ${maxBytes}`,
      });
    }

    const reader = response.body?.getReader();

    if (!reader) {
      throw getError({ message: '[readBytes] Response carried no body' });
    }

    const chunks: Uint8Array[] = [];
    let received = 0;

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      received += value.length;

      if (received > maxBytes) {
        await reader.cancel();
        throw getError({
          error: UrlSafetyErrors.URL_REFUSED,
          message: `[readBytes] Body exceeds the cap | received: ${received} | max: ${maxBytes}`,
        });
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(received);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    return bytes;
  }
}
