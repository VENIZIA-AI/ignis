import { BaseHelper } from '../base';

/**
 * The correlation id every IGNIS host stamps on a request, so a server, a browser Worker and the
 * page calling it cannot drift into different formats.
 *
 * Never `crypto.randomUUID()` on its own, which is `hono/request-id`'s default: browsers gate that
 * one API on a SECURE CONTEXT. Measured in Chrome - on `http://<lan-ip>` both the page and a Worker
 * report `crypto` present and `getRandomValues` working, while `randomUUID` and `subtle` are
 * `undefined` and the call throws `TypeError`. On `http://localhost` (a secure origin) all four are
 * there. So the gate follows the ORIGIN, not the worker: testing from a phone over the LAN is
 * enough to lose it.
 *
 * `getRandomValues` carries no such gate, so the fallback below builds the identical shape from raw
 * entropy - a log pipeline cannot tell the two paths apart.
 */
export class RequestIdGenerator extends BaseHelper {
  /** 256 pre-rendered octets: formatting a byte as hex costs more than drawing the entropy does. */
  private static readonly HEX_OCTETS = Array.from({ length: 256 }, (_, value) =>
    (value + 0x100).toString(16).slice(1),
  );

  /** Reused across calls - `nextId()` never yields between filling this and reading it. */
  private readonly entropy = new Uint8Array(16);

  private readonly generate: () => string;

  constructor(opts?: { scope?: string }) {
    super({ scope: opts?.scope ?? RequestIdGenerator.name });

    // Resolved once, not per call: whether the host exposes `randomUUID` is fixed for the life of a
    // realm, so a per-request branch would only pay for a question already answered.
    this.generate =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? () => globalThis.crypto.randomUUID()
        : () => this.uuidFromEntropy();
  }

  nextId(): string {
    return this.generate();
  }

  /** RFC 9562 version 4, same shape `crypto.randomUUID()` returns: version nibble 4, variant 10xx. */
  private uuidFromEntropy(): string {
    const bytes = this.entropy;
    globalThis.crypto.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = RequestIdGenerator.HEX_OCTETS;

    return (
      hex[bytes[0]] +
      hex[bytes[1]] +
      hex[bytes[2]] +
      hex[bytes[3]] +
      '-' +
      hex[bytes[4]] +
      hex[bytes[5]] +
      '-' +
      hex[bytes[6]] +
      hex[bytes[7]] +
      '-' +
      hex[bytes[8]] +
      hex[bytes[9]] +
      '-' +
      hex[bytes[10]] +
      hex[bytes[11]] +
      hex[bytes[12]] +
      hex[bytes[13]] +
      hex[bytes[14]] +
      hex[bytes[15]]
    );
  }
}
