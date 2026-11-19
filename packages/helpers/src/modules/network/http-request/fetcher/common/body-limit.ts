import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import type { ApplicationError } from '@venizia/ignis-inversion';
import { UrlSafetyErrors } from '@/modules/network/utilities/url-safety/common/errors';
import { UrlSafetyDefaults } from '@/modules/network/utilities/url-safety/common/constants';

/** The largest body a call accepts when it names no `maxBytes` of its own. */
const DEFAULT_MAX_BYTES = UrlSafetyDefaults.MAX_BYTES;

/** A cap on a body, for a stream piped onward or a body read into memory. Browser-pure: streams and typed arrays only. */
export class BodyLimit {
  /** The one refusal of a body over the cap; `detail` says how it was found (declared, received, a client's own words). */
  static refuse(opts: { detail: string }): ApplicationError {
    return getError({
      error: UrlSafetyErrors.URL_REFUSED,
      message: `[fetch] Body exceeds the cap | ${opts.detail}`,
    });
  }

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
              BodyLimit.refuse({ detail: `received: ${received} | max: ${maxBytes}` }),
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
    const declared = Number(opts.headers.get(HTTP.Headers.CONTENT_LENGTH) ?? 0);

    return Number.isFinite(declared) ? declared : 0;
  }

  /** At most `maxBytes` of the body, then the rest released; a body that fails halfway answers what arrived. Never throws on size: a refused status must still say what it was. */
  static async readPrefix(opts: { response: Response; maxBytes: number }): Promise<Uint8Array> {
    const { response, maxBytes } = opts;
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    if (!reader) {
      return new Uint8Array();
    }

    try {
      while (received < maxBytes) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        chunks.push(value.subarray(0, maxBytes - received));
        received += chunks[chunks.length - 1].length;
      }
      // eslint-disable-next-line venizia/no-silent-catch -- the status is the answer; a body that broke off is reported as the shorter body it was
    } catch {
      // The chunks that arrived stand.
    }

    try {
      await reader.cancel();
      // eslint-disable-next-line venizia/no-silent-catch -- the stream is released as far as it can be; nothing is left to report
    } catch {
      // Already closed or errored.
    }

    const bytes = new Uint8Array(received);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    return bytes;
  }

  /** `readBytes`, decoded as UTF-8 text. */
  static async readText(opts: { response: Response; maxBytes?: number }): Promise<string> {
    const bytes = await BodyLimit.readBytes(opts);

    return new TextDecoder().decode(bytes);
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
      throw BodyLimit.refuse({ detail: `declared: ${declaredLength} | max: ${maxBytes}` });
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
        throw BodyLimit.refuse({ detail: `received: ${received} | max: ${maxBytes}` });
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
