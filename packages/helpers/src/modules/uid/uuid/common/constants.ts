/**
 * The four namespaces RFC 9562 names. A namespace partitions the deterministic space, so one
 * `name` under two namespaces answers two ids.
 *
 * Need your own? Mint it ONCE (`bun -e "console.log(crypto.randomUUID())"`) and pin it as a
 * constant. Generating one at runtime makes `uuidV5` answer a different id every call, silently.
 */
export class UuidNamespaces {
  /** Fully-qualified domain names. */
  static readonly DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  /** URLs. The usual pick for a business key written as a path, like `orders/4711/refund`. */
  static readonly URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

  /** ISO object identifiers. */
  static readonly OID = '6ba7b812-9dad-11d1-80b4-00c04fd430c8';

  /** X.500 distinguished names. */
  static readonly X500 = '6ba7b814-9dad-11d1-80b4-00c04fd430c8';
}

/** 256 pre-rendered octets: formatting a byte as hex costs more than producing it does. */
export const UUID_HEX_OCTETS = Array.from({ length: 256 }, (_, value) =>
  (value + 0x100).toString(16).slice(1),
);

/**
 * Lowercase, version 1-8, RFC variant. The all-zero nil id and the all-one max id fail it on
 * purpose: both are placeholders, and a column holding one is holding a bug.
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Any well-formed UUID, either case: a v5 namespace is 16 bytes, and RFC 9562 reads its hex
 * case-insensitively. Wider than {@link UUID_PATTERN} on purpose - the nil UUID is a valid namespace.
 */
export const UUID_NAMESPACE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parsed namespaces are cached; past this many distinct ones the cache stops growing and parsing resumes, so a caller-fed namespace cannot grow the map without bound. */
export const MAX_CACHED_NAMESPACES = 32;
