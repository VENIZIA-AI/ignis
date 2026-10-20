// Past the barrels: this module ships on the `./uuid` subpath and must not pull their surface.
import { getError } from '@venizia/ignis-inversion';
import { HTTP } from '@/common/constants/http';
import { MAX_CACHED_NAMESPACES, UUID_HEX_OCTETS, UUID_NAMESPACE_PATTERN } from './common/constants';
import { Sha1Digest } from './sha1';

/** Fits a namespace plus a ~160-character name; a longer one allocates for its own call. */
const INPUT_SIZE = 512;

/** Builds a v5 generator with its own namespace cache and buffer. */
export const createUuidV5 = (): ((opts: { namespace: string; name: string }) => string) => {
  const encoder = new TextEncoder();

  /** Parsed namespaces, capped so a caller-fed one cannot grow the map without bound. */
  const namespaces = new Map<string, Uint8Array>();

  const input = new Uint8Array(INPUT_SIZE);
  const nameView = input.subarray(16);

  const resolveNamespace = (opts: { namespace: string }): Uint8Array => {
    const { namespace } = opts;

    const cached = namespaces.get(namespace);
    if (cached) {
      return cached;
    }

    if (!UUID_NAMESPACE_PATTERN.test(namespace)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[uuidV5] namespace must be a UUID - received: ${namespace}`,
      });
    }

    const bytes = new Uint8Array(16);
    const hex = namespace.replaceAll('-', '');
    for (let index = 0; index < 16; index++) {
      bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }

    if (namespaces.size < MAX_CACHED_NAMESPACES) {
      namespaces.set(namespace, bytes);
    }

    return bytes;
  };

  return opts => {
    const { namespace, name } = opts;

    const namespaceBytes = resolveNamespace({ namespace });

    // Encoding turns a lone surrogate into U+FFFD, so two different malformed names would share an id.
    if (typeof name.isWellFormed === 'function' && !name.isWellFormed()) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message:
          '[uuidV5] name carries a lone surrogate - it is not well-formed UTF-16 and would collide with another name',
      });
    }

    // UTF-8 never exceeds 3 bytes per UTF-16 code unit. An oversized name gets a buffer of its own
    // for this call only, so one huge name does not pin its size for the life of the process.
    const required = 16 + name.length * 3;
    const target = required > input.length ? new Uint8Array(required) : input;
    const targetName = target === input ? nameView : target.subarray(16);

    target.set(namespaceBytes);
    const { written } = encoder.encodeInto(name, targetName);

    const digest = Sha1Digest.of({ bytes: target.subarray(0, 16 + written) });
    digest[6] = (digest[6] & 0x0f) | 0x50;
    digest[8] = (digest[8] & 0x3f) | 0x80;

    const hex = UUID_HEX_OCTETS;

    return (
      hex[digest[0]] +
      hex[digest[1]] +
      hex[digest[2]] +
      hex[digest[3]] +
      '-' +
      hex[digest[4]] +
      hex[digest[5]] +
      '-' +
      hex[digest[6]] +
      hex[digest[7]] +
      '-' +
      hex[digest[8]] +
      hex[digest[9]] +
      '-' +
      hex[digest[10]] +
      hex[digest[11]] +
      hex[digest[12]] +
      hex[digest[13]] +
      hex[digest[14]] +
      hex[digest[15]]
    );
  };
};

/**
 * Mints a deterministic UUID v5 from `namespace` and `name` - an idempotency key.
 *
 * Reproducible therefore NOT secret: never a share link, a reset token or an API key.
 */
export const uuidV5: (opts: { namespace: string; name: string }) => string = createUuidV5();
