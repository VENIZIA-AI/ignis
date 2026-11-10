/**
 * CRC-32 (IEEE 802.3, reflected polynomial `0xEDB88320`), the checksum of zlib, PNG and Ethernet.
 * Internal: not exported from the barrel. Pure JS, so the `uid` module stays browser-pure - no
 * `node:zlib`, no `Bun.hash`.
 *
 * A CRC detects a typo; it does not authenticate. The polynomial is public, so anyone can compute
 * the checksum of any text.
 */
export class Crc32 {
  private static readonly POLYNOMIAL = 0xedb88320;
  private static readonly TABLE_SIZE = 256;
  private static readonly BITS_PER_BYTE = 8;
  private static readonly INITIAL = 0xffffffff;

  /** Built on first use, one entry per byte value. */
  private static table?: Uint32Array;

  private static getTable(): Uint32Array {
    if (Crc32.table) {
      return Crc32.table;
    }

    const table = new Uint32Array(Crc32.TABLE_SIZE);

    for (let index = 0; index < Crc32.TABLE_SIZE; index++) {
      let value = index;

      for (let bit = 0; bit < Crc32.BITS_PER_BYTE; bit++) {
        value = value & 1 ? (value >>> 1) ^ Crc32.POLYNOMIAL : value >>> 1;
      }

      table[index] = value >>> 0;
    }

    Crc32.table = table;

    return table;
  }

  /** The unsigned 32-bit CRC of the UTF-8 bytes of `text`. `''` is `0`. */
  static of(opts: { text: string }): number {
    const table = Crc32.getTable();
    let crc = Crc32.INITIAL;

    for (const byte of new TextEncoder().encode(opts.text)) {
      crc = table[(crc ^ byte) & 0xff] ^ (crc >>> Crc32.BITS_PER_BYTE);
    }

    return (crc ^ Crc32.INITIAL) >>> 0;
  }
}
