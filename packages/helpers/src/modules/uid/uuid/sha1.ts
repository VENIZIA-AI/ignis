/**
 * SHA-1 over bytes, synchronous, no host API - `node:crypto` fails the purity gate and
 * `crypto.subtle` is async and secure-context only.
 *
 * Only UUID v5 uses it. SHA-1 is broken against a chosen-prefix collision: never sign, authenticate
 * or store a password with it.
 */
export class Sha1Digest {
  /** Reused: `of()` never yields, so no second call can observe it mid-flight. */
  private static readonly SCHEDULE = new Uint32Array(80);

  /** Padding buffer sized for a namespace plus a name; a longer input allocates. */
  private static readonly SCRATCH = new Uint8Array(512);

  private static readonly K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];

  /** Digests `bytes` into 20 big-endian bytes. */
  static of(opts: { bytes: Uint8Array }): Uint8Array {
    const { bytes } = opts;
    const length = bytes.length;

    // Padding: a `0x80` byte, zeroes, then the bit length in the last 8 bytes of the last block.
    const blockCount = Math.floor((length + 8) / 64) + 1;
    const paddedLength = blockCount * 64;

    const reusable = paddedLength <= Sha1Digest.SCRATCH.length;
    const padded = reusable ? Sha1Digest.SCRATCH : new Uint8Array(paddedLength);

    padded.set(bytes);
    padded[length] = 0x80;
    if (reusable) {
      // The scratch still holds the previous input past this one: zero the gap, not the whole buffer.
      padded.fill(0, length + 1, paddedLength);
    }

    // The bit length is 3 bits wider than 32 for inputs over 512 MB: split it arithmetically.
    const bitsHigh = Math.floor(length / 0x20000000);
    const bitsLow = (length << 3) >>> 0;
    padded[paddedLength - 8] = (bitsHigh >>> 24) & 0xff;
    padded[paddedLength - 7] = (bitsHigh >>> 16) & 0xff;
    padded[paddedLength - 6] = (bitsHigh >>> 8) & 0xff;
    padded[paddedLength - 5] = bitsHigh & 0xff;
    padded[paddedLength - 4] = (bitsLow >>> 24) & 0xff;
    padded[paddedLength - 3] = (bitsLow >>> 16) & 0xff;
    padded[paddedLength - 2] = (bitsLow >>> 8) & 0xff;
    padded[paddedLength - 1] = bitsLow & 0xff;

    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;

    const schedule = Sha1Digest.SCHEDULE;
    const constants = Sha1Digest.K;

    for (let block = 0; block < paddedLength; block += 64) {
      for (let index = 0; index < 16; index++) {
        const at = block + index * 4;
        schedule[index] =
          ((padded[at] << 24) | (padded[at + 1] << 16) | (padded[at + 2] << 8) | padded[at + 3]) >>>
          0;
      }

      for (let index = 16; index < 80; index++) {
        const mixed =
          schedule[index - 3] ^ schedule[index - 8] ^ schedule[index - 14] ^ schedule[index - 16];
        schedule[index] = (mixed << 1) | (mixed >>> 31);
      }

      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;

      for (let index = 0; index < 80; index++) {
        const round = (index / 20) | 0;

        let mixed: number;
        if (round === 0) {
          mixed = (b & c) | (~b & d);
        } else if (round === 2) {
          mixed = (b & c) | (b & d) | (c & d);
        } else {
          mixed = b ^ c ^ d;
        }

        const next =
          (((a << 5) | (a >>> 27)) + mixed + e + constants[round] + schedule[index]) >>> 0;

        e = d;
        d = c;
        c = (b << 30) | (b >>> 2);
        b = a;
        a = next;
      }

      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
    }

    const digest = new Uint8Array(20);
    const words = [h0, h1, h2, h3, h4];
    for (let index = 0; index < 5; index++) {
      const word = words[index];
      const at = index * 4;
      digest[at] = (word >>> 24) & 0xff;
      digest[at + 1] = (word >>> 16) & 0xff;
      digest[at + 2] = (word >>> 8) & 0xff;
      digest[at + 3] = word & 0xff;
    }

    return digest;
  }
}
