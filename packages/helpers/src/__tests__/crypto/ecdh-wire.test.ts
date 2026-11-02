import { describe, expect, test } from 'bun:test';
import type { webcrypto } from 'node:crypto';
import { BaseHelper } from '@/modules/base';
import { AbstractCryptoAlgorithm, AES, ECDH, RSA } from '@/modules/crypto/algorithms';
import type { IECDHEncryptedPayload } from '@/modules/crypto/algorithms';

/**
 * `ECDH` runs in a browser, so its base64 is `btoa`/`atob`, not `Buffer`. These tests hold the wire format
 * still across that change: payloads written by the `Buffer` implementation decrypt with this one, what this one
 * writes is what a `Buffer` reader reads, and a wrong salt, info, additional data or ciphertext is refused.
 */

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const;
const INVALID_BASE64 = '[ECDH.fromBase64] Invalid base64 input';

/**
 * Produced once by the `Buffer` implementation of `ECDH` (the code before this change), with fixed keys and a fixed
 * salt, so a reader of today decrypts what the old writer wrote. The private keys are test data only.
 */
const KNOWN = {
  salt: 'AQgPFh0kKzI5QEdOVVxjanF4f4aNlJuiqbC3vsXM09o=',
  serverPublicKey:
    'BIMN+GiOQ0TpKnLOdLJCZl/Rs5/r09OnTnwiOGmEfsHjGYfCyfpprZWyXVgTP0U1jBzUu8LPQotVkbnN0J7DkLk=',
  clientPublicKey:
    'BDK6QGRYEAJqA2iT/kKEZ/3SctaasJuizfD+1zfntPiLxvV/L0F3wmBhvZLu5aFxAKjaB7ZFgxx9rsxv97U7+PY=',
  serverPrivateJwk: {
    crv: 'P-256',
    d: 'zKE3LPpx5ScPV40n1IvnQiMhHfmmiLwrKY8yzmav9ew',
    kty: 'EC',
    x: 'gw34aI5DROkqcs50skJmX9Gzn-vT06dOfCI4aYR-weM',
    y: 'GYfCyfpprZWyXVgTP0U1jBzUu8LPQotVkbnN0J7DkLk',
  },
  clientPrivateJwk: {
    crv: 'P-256',
    d: 'aRmMOguKH41te2ba2eGBxTXArVD6HY_bpzcRQjk1Pb4',
    kty: 'EC',
    x: 'MrpAZFgQAmoDaJP-QoRn_dJy1pqwm6LN8P7XN-e0-Is',
    y: 'xvV_L0F3wmBhvZLu5aFxAKjaB7ZFgxx9rsxv97U7-PY',
  },
  payloads: [
    {
      name: 'plain',
      message: 'hello from the old ECDH',
      payload: {
        iv: 'ypbAmy2CeutA61hH',
        ct: 'oKOyKUazmGZTfOGY53hL04wsbvp3Mi7xmj3fJqUD3rf+ZTtkoWdy',
      },
    },
    {
      name: 'aad',
      message: 'hello with context',
      additionalData: 'ws:session-1',
      payload: {
        iv: 'Bz0ROJPBhp94Saaa',
        ct: 'vbmKIqO2MqNfj2QPd5fJQSSopG6PrMoWYZhpBnXctvF8Sg==',
      },
    },
    {
      name: 'unicode',
      message: 'xin chào - 你好 - 🔐',
      payload: {
        iv: '5Ky+0a12FrH+vFjB',
        ct: 'rB0uaw59Q2qfx5KW+hghkDeI02i7Qz/GnGTVjC3REvgUE/Wpk4eULTk=',
      },
    },
  ],
} as const;

const importPrivate = (source: {
  readonly kty: string;
  readonly crv: string;
  readonly d: string;
  readonly x: string;
  readonly y: string;
}): Promise<CryptoKey> => {
  const jwk: webcrypto.JsonWebKey = { ...source, ext: true };
  return crypto.subtle.importKey('jwk', jwk, CURVE, false, ['deriveBits']);
};

const toBuffer = (base64: string): Buffer => Buffer.from(base64, 'base64');

/** The same bytes as a plain `Uint8Array` over an `ArrayBuffer`, which is what WebCrypto takes as `BufferSource`. */
const toBytes = (base64: string): Uint8Array<ArrayBuffer> => new Uint8Array(toBuffer(base64));

/** The wire format written out with raw WebCrypto and `Buffer`, with none of `ECDH`'s code in it. */
const referenceKey = async (opts: {
  privateKey: CryptoKey;
  peerPublicKeyB64: string;
  saltB64: string;
  info?: string;
}): Promise<CryptoKey> => {
  const peer = await crypto.subtle.importKey(
    'raw',
    toBytes(opts.peerPublicKeyB64),
    CURVE,
    false,
    [],
  );
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, opts.privateKey, 256);
  const material = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toBytes(opts.saltB64),
      info: new TextEncoder().encode(opts.info ?? 'ignis-ecdh-p256-aes-256-gcm-v1'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return key;
};

/** A server and a client that share a key: the server makes the salt, the client is handed it. */
const exchange = async (opts?: {
  serverInfo?: string;
  clientInfo?: string;
  clientSalt?: string;
}) => {
  const server = ECDH.withAlgorithm({ algorithm: 'ecdh-p256', hkdfInfo: opts?.serverInfo });
  const client = ECDH.withAlgorithm({ algorithm: 'ecdh-p256', hkdfInfo: opts?.clientInfo });
  const serverPair = await server.generateKeyPair();
  const clientPair = await client.generateKeyPair();
  const clientPublic = await server.importPublicKey({ rawKeyB64: clientPair.publicKeyB64 });
  const serverPublic = await client.importPublicKey({ rawKeyB64: serverPair.publicKeyB64 });
  const serverSide = await server.deriveAESKey({
    privateKey: serverPair.keyPair.privateKey,
    peerPublicKey: clientPublic,
  });
  const clientSide = await client.deriveAESKey({
    privateKey: clientPair.keyPair.privateKey,
    peerPublicKey: serverPublic,
    salt: opts?.clientSalt ?? serverSide.salt,
  });
  return { server, client, serverPair, clientPair, serverSide, clientSide };
};

describe('ECDH wire format', () => {
  describe('payloads written by the Buffer implementation', () => {
    for (const entry of KNOWN.payloads) {
      test(`decrypt with the btoa/atob implementation: ${entry.name}`, async () => {
        const ecdh = ECDH.withAlgorithm();
        const privateKey = await importPrivate(KNOWN.clientPrivateJwk);
        const peer = await ecdh.importPublicKey({ rawKeyB64: KNOWN.serverPublicKey });
        const { key } = await ecdh.deriveAESKey({
          privateKey,
          peerPublicKey: peer,
          salt: KNOWN.salt,
        });

        const extra =
          'additionalData' in entry ? { additionalData: entry.additionalData } : undefined;
        const message = await ecdh.decrypt({ message: entry.payload, secret: key, opts: extra });

        expect(message).toBe(entry.message);
      });
    }

    test('the other side of the same exchange reads them too', async () => {
      const ecdh = ECDH.withAlgorithm();
      const privateKey = await importPrivate(KNOWN.serverPrivateJwk);
      const peer = await ecdh.importPublicKey({ rawKeyB64: KNOWN.clientPublicKey });
      const { key } = await ecdh.deriveAESKey({
        privateKey,
        peerPublicKey: peer,
        salt: KNOWN.salt,
      });

      const entry = KNOWN.payloads[0];
      const message = await ecdh.decrypt({ message: entry.payload, secret: key });

      expect(message).toBe(entry.message);
    });
  });

  describe('what it writes is what a Buffer reader reads', () => {
    test('raw WebCrypto and Buffer decrypt a payload this implementation wrote', async () => {
      const ecdh = ECDH.withAlgorithm();
      const privateKey = await importPrivate(KNOWN.clientPrivateJwk);
      const peer = await ecdh.importPublicKey({ rawKeyB64: KNOWN.serverPublicKey });
      const { key } = await ecdh.deriveAESKey({
        privateKey,
        peerPublicKey: peer,
        salt: KNOWN.salt,
      });
      const text = 'written by btoa - xin chào 🔐';
      const payload = await ecdh.encrypt({
        message: text,
        secret: key,
        opts: { additionalData: 'ctx' },
      });

      const serverPrivate = await importPrivate(KNOWN.serverPrivateJwk);
      const reference = await referenceKey({
        privateKey: serverPrivate,
        peerPublicKeyB64: KNOWN.clientPublicKey,
        saltB64: KNOWN.salt,
      });
      const plain = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toBytes(payload.iv),
          tagLength: 128,
          additionalData: new TextEncoder().encode('ctx'),
        },
        reference,
        toBytes(payload.ct),
      );

      expect(new TextDecoder().decode(plain)).toBe(text);
    });

    test('a payload written with raw WebCrypto and Buffer decrypts here', async () => {
      const serverPrivate = await importPrivate(KNOWN.serverPrivateJwk);
      const reference = await referenceKey({
        privateKey: serverPrivate,
        peerPublicKeyB64: KNOWN.clientPublicKey,
        saltB64: KNOWN.salt,
      });
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const sealed = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        reference,
        new TextEncoder().encode('written by Buffer'),
      );
      const payload: IECDHEncryptedPayload = {
        iv: Buffer.from(iv).toString('base64'),
        ct: Buffer.from(sealed).toString('base64'),
      };

      const ecdh = ECDH.withAlgorithm();
      const privateKey = await importPrivate(KNOWN.clientPrivateJwk);
      const peer = await ecdh.importPublicKey({ rawKeyB64: KNOWN.serverPublicKey });
      const { key } = await ecdh.deriveAESKey({
        privateKey,
        peerPublicKey: peer,
        salt: KNOWN.salt,
      });
      const message = await ecdh.decrypt({ message: payload, secret: key });

      expect(message).toBe('written by Buffer');
    });

    test('every base64 field is canonical: a Buffer round trip returns the same text', async () => {
      const { client, serverPair, serverSide, clientSide } = await exchange();
      const payload = await client.encrypt({ message: 'canonical', secret: clientSide.key });

      for (const field of [payload.iv, payload.ct, serverSide.salt, serverPair.publicKeyB64]) {
        expect(toBuffer(field).toString('base64')).toBe(field);
      }
      expect(toBuffer(payload.iv).length).toBe(12);
      expect(toBuffer(serverSide.salt).length).toBe(32);
      expect(toBuffer(serverPair.publicKeyB64).length).toBe(65);
    });
  });
});

describe('ECDH between two parties', () => {
  test('a message goes both ways, with and without additional data', async () => {
    const { server, client, serverSide, clientSide } = await exchange();

    const toServer = await client.encrypt({ message: 'client to server', secret: clientSide.key });
    const atServer = await server.decrypt({ message: toServer, secret: serverSide.key });
    expect(atServer).toBe('client to server');

    const extra = { additionalData: 'ws:session-9' };
    const toClient = await server.encrypt({
      message: 'server to client',
      secret: serverSide.key,
      opts: extra,
    });
    const atClient = await client.decrypt({
      message: toClient,
      secret: clientSide.key,
      opts: extra,
    });
    expect(atClient).toBe('server to client');
  });

  test('a custom hkdfInfo works when both sides use it', async () => {
    const { server, client, serverSide, clientSide } = await exchange({
      serverInfo: 'app-v2',
      clientInfo: 'app-v2',
    });

    const payload = await client.encrypt({ message: 'custom info', secret: clientSide.key });
    const message = await server.decrypt({ message: payload, secret: serverSide.key });
    expect(message).toBe('custom info');
  });

  test('every padding length of base64 round trips (0 to 5 bytes of message)', async () => {
    const { server, client, serverSide, clientSide } = await exchange();

    for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'abcde']) {
      const payload = await client.encrypt({ message: text, secret: clientSide.key });
      const message = await server.decrypt({ message: payload, secret: serverSide.key });
      expect(message).toBe(text);
    }
  });

  test('a message longer than one base64 chunk round trips and stays canonical', async () => {
    const { server, client, serverSide, clientSide } = await exchange();
    const text = 'xin chào '.repeat(30_000);

    const payload = await client.encrypt({ message: text, secret: clientSide.key });
    const message = await server.decrypt({ message: payload, secret: serverSide.key });

    expect(message).toBe(text);
    expect(toBuffer(payload.ct).toString('base64')).toBe(payload.ct);
    expect(toBuffer(payload.ct).length).toBeGreaterThan(0x8000);
  });
});

describe('ECDH refuses what does not match', () => {
  test('a different salt derives a different key', async () => {
    const wrongSalt = Buffer.alloc(32, 7).toString('base64');
    const { server, client, serverSide, clientSide } = await exchange({ clientSalt: wrongSalt });

    const payload = await client.encrypt({ message: 'secret', secret: clientSide.key });

    return expect(server.decrypt({ message: payload, secret: serverSide.key })).rejects.toThrow();
  });

  test('a client with another hkdfInfo cannot read the server', async () => {
    const { server, client, serverSide, clientSide } = await exchange({
      serverInfo: 'info-a',
      clientInfo: 'info-b',
    });

    const payload = await server.encrypt({ message: 'secret', secret: serverSide.key });

    return expect(client.decrypt({ message: payload, secret: clientSide.key })).rejects.toThrow();
  });

  test('additional data that differs on decrypt is refused', async () => {
    const { server, client, serverSide, clientSide } = await exchange();
    const payload = await client.encrypt({
      message: 'bound',
      secret: clientSide.key,
      opts: { additionalData: 'ctx-a' },
    });

    return expect(
      server.decrypt({
        message: payload,
        secret: serverSide.key,
        opts: { additionalData: 'ctx-b' },
      }),
    ).rejects.toThrow();
  });

  test('additional data that is missing on decrypt is refused', async () => {
    const { server, client, serverSide, clientSide } = await exchange();
    const payload = await client.encrypt({
      message: 'bound',
      secret: clientSide.key,
      opts: { additionalData: 'ctx-a' },
    });

    return expect(server.decrypt({ message: payload, secret: serverSide.key })).rejects.toThrow();
  });

  test('a changed ciphertext is refused', async () => {
    const { server, client, serverSide, clientSide } = await exchange();
    const payload = await client.encrypt({ message: 'intact', secret: clientSide.key });
    const flipped = toBuffer(payload.ct);
    flipped[0] ^= 1;

    return expect(
      server.decrypt({
        message: { iv: payload.iv, ct: flipped.toString('base64') },
        secret: serverSide.key,
      }),
    ).rejects.toThrow();
  });

  test('a changed iv is refused', async () => {
    const { server, client, serverSide, clientSide } = await exchange();
    const payload = await client.encrypt({ message: 'intact', secret: clientSide.key });
    const otherIv = Buffer.alloc(12, 1).toString('base64');

    return expect(
      server.decrypt({ message: { iv: otherIv, ct: payload.ct }, secret: serverSide.key }),
    ).rejects.toThrow();
  });

  test('a stranger key pair cannot read the exchange', async () => {
    const { client, clientSide } = await exchange();
    const stranger = await exchange();

    const payload = await client.encrypt({ message: 'private', secret: clientSide.key });

    return expect(
      stranger.server.decrypt({ message: payload, secret: stranger.serverSide.key }),
    ).rejects.toThrow();
  });
});

describe('ECDH base64 input is strict', () => {
  const ecdh = ECDH.withAlgorithm();
  const cases: Array<[string, string]> = [
    ['empty', ''],
    ['length not a multiple of 4', 'AAA'],
    ['a character outside the alphabet', 'AA*A'],
    ['padding in the middle', 'AA=A'],
    ['url-safe alphabet', 'AA-_'],
  ];

  for (const [name, value] of cases) {
    test(`importPublicKey refuses ${name}`, () => {
      return expect(ecdh.importPublicKey({ rawKeyB64: value })).rejects.toThrow(INVALID_BASE64);
    });
  }

  test('decrypt refuses an iv that is not base64', async () => {
    const { server, serverSide } = await exchange();

    return expect(
      server.decrypt({ message: { iv: '!!!!', ct: 'AAAA' }, secret: serverSide.key }),
    ).rejects.toThrow(INVALID_BASE64);
  });

  test('decrypt refuses a ciphertext that is not base64', async () => {
    const { server, serverSide } = await exchange();

    return expect(
      server.decrypt({ message: { iv: 'AAAAAAAAAAAAAAAA', ct: 'A' }, secret: serverSide.key }),
    ).rejects.toThrow(INVALID_BASE64);
  });

  test('deriveAESKey refuses a salt that is not base64', async () => {
    const pairA = await ecdh.generateKeyPair();
    const pairB = await ecdh.generateKeyPair();
    const peer = await ecdh.importPublicKey({ rawKeyB64: pairB.publicKeyB64 });

    return expect(
      ecdh.deriveAESKey({
        privateKey: pairA.keyPair.privateKey,
        peerPublicKey: peer,
        salt: 'not base64!',
      }),
    ).rejects.toThrow(INVALID_BASE64);
  });
});

describe('ECDH keeps its shape', () => {
  test('new ECDH({ algorithm, hkdfInfo }) works like withAlgorithm, and the two interoperate', async () => {
    const built = new ECDH({ algorithm: 'ecdh-p256', hkdfInfo: 'app-v3' });
    const made = ECDH.withAlgorithm({ algorithm: 'ecdh-p256', hkdfInfo: 'app-v3' });
    const builtPair = await built.generateKeyPair();
    const madePair = await made.generateKeyPair();
    const madePublic = await built.importPublicKey({ rawKeyB64: madePair.publicKeyB64 });
    const builtPublic = await made.importPublicKey({ rawKeyB64: builtPair.publicKeyB64 });
    const builtSide = await built.deriveAESKey({
      privateKey: builtPair.keyPair.privateKey,
      peerPublicKey: madePublic,
    });
    const madeSide = await made.deriveAESKey({
      privateKey: madePair.keyPair.privateKey,
      peerPublicKey: builtPublic,
      salt: builtSide.salt,
    });

    const payload = await built.encrypt({ message: 'constructor path', secret: builtSide.key });
    const message = await made.decrypt({ message: payload, secret: madeSide.key });

    expect(message).toBe('constructor path');
  });

  test('new ECDH() with no options is valid', () => {
    const ecdh = new ECDH();

    expect(ecdh.algorithm).toBe('ecdh-p256');
  });

  test('it is still an AbstractCryptoAlgorithm and a BaseHelper, with their members', () => {
    const ecdh = ECDH.withAlgorithm();

    expect(ecdh).toBeInstanceOf(AbstractCryptoAlgorithm);
    expect(ecdh).toBeInstanceOf(BaseHelper);
    expect(ecdh.scope).toBe('ECDH');
    expect(ecdh.identifier).toBe('ecdh-p256');
    expect(typeof ecdh.logger.info).toBe('function');
  });

  test('AES and RSA still extend the same abstract class', () => {
    expect(AES.withAlgorithm('aes-256-gcm')).toBeInstanceOf(AbstractCryptoAlgorithm);
    expect(RSA.withAlgorithm()).toBeInstanceOf(AbstractCryptoAlgorithm);
  });
});
