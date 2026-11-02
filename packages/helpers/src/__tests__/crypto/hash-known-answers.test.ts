import { describe, expect, test } from 'bun:test';
import { Hash } from '@/modules/crypto/algorithms';
import {
  HashAlgorithms,
  HashOutputEncodings,
  type THashAlgorithm,
  type THashOutputEncoding,
} from '@/modules/crypto/common';

/**
 * Digests and HMACs written by the `node:crypto` implementation of `Hash` (the code before it moved to
 * `Bun.CryptoHasher`), frozen here: every algorithm `Hash` accepts, every output encoding, text, bytes, several
 * parts, a binary key and a key longer than the block size. The moved implementation must give the same text.
 */
const BIN_KEY = new Uint8Array([255, 254, 0, 128, 127, 1]);
const LONG_KEY = 'x'.repeat(200);

interface IRow {
  algorithm: THashAlgorithm;
  encoding: THashOutputEncoding;
  digestAbc: string;
  digestParts: string;
  digestUnicode: string;
  digestEmpty: string;
  hmacText: string;
  hmacBinKey: string;
  hmacLongKey: string;
  hmacBytesMsg: string;
}

const ROWS: ReadonlyArray<IRow> = [
  {
    algorithm: 'md5',
    encoding: 'hex',
    digestAbc: '900150983cd24fb0d6963f7d28e17f72',
    digestParts: '6b51b23a8cfaf3051dfc0babc5488d0f',
    digestUnicode: '8b3c4ce7c0701e889e9143ef6242b732',
    digestEmpty: 'd41d8cd98f00b204e9800998ecf8427e',
    hmacText: 'd006bc60c92ff6e54f615474fe835e02',
    hmacBinKey: 'cbc8a17a119954473a3837a545adad49',
    hmacLongKey: '17015fd9788bc144e2dee53b49842a42',
    hmacBytesMsg: 'eb705611381433fdfe96ffc83f709df5',
  },
  {
    algorithm: 'md5',
    encoding: 'base64',
    digestAbc: 'kAFQmDzST7DWlj99KOF/cg==',
    digestParts: 'a1GyOoz68wUd/AurxUiNDw==',
    digestUnicode: 'izxM58BwHoiekUPvYkK3Mg==',
    digestEmpty: '1B2M2Y8AsgTpgAmY7PhCfg==',
    hmacText: '0Aa8YMkv9uVPYVR0/oNeAg==',
    hmacBinKey: 'y8ihehGZVEc6ODelRa2tSQ==',
    hmacLongKey: 'FwFf2XiLwUTi3uU7SYQqQg==',
    hmacBytesMsg: '63BWETgUM/3+lv/IP3Cd9Q==',
  },
  {
    algorithm: 'md5',
    encoding: 'base64url',
    digestAbc: 'kAFQmDzST7DWlj99KOF_cg',
    digestParts: 'a1GyOoz68wUd_AurxUiNDw',
    digestUnicode: 'izxM58BwHoiekUPvYkK3Mg',
    digestEmpty: '1B2M2Y8AsgTpgAmY7PhCfg',
    hmacText: '0Aa8YMkv9uVPYVR0_oNeAg',
    hmacBinKey: 'y8ihehGZVEc6ODelRa2tSQ',
    hmacLongKey: 'FwFf2XiLwUTi3uU7SYQqQg',
    hmacBytesMsg: '63BWETgUM_3-lv_IP3Cd9Q',
  },
  {
    algorithm: 'sha1',
    encoding: 'hex',
    digestAbc: 'a9993e364706816aba3e25717850c26c9cd0d89d',
    digestParts: 'f2ba8f84ab5c1bce84a7b441cb1959cfc7093b7f',
    digestUnicode: 'b78a383e23d1c9e124ac78b7587c4537ac9cf716',
    digestEmpty: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
    hmacText: '22f9e077a3cebd09248154f85d9a56c79941fd96',
    hmacBinKey: '01ae3d69898512ae9887dd016b1af12153021ec4',
    hmacLongKey: 'dc3cff698fc1ebc1a9e088dd869772791ed60db1',
    hmacBytesMsg: 'ed9aec33244bbab11325535fa3a85f0e4d0d0530',
  },
  {
    algorithm: 'sha1',
    encoding: 'base64',
    digestAbc: 'qZk+NkcGgWq6PiVxeFDCbJzQ2J0=',
    digestParts: '8rqPhKtcG86Ep7RByxlZz8cJO38=',
    digestUnicode: 't4o4PiPRyeEkrHi3WHxFN6yc9xY=',
    digestEmpty: '2jmj7l5rSw0yVb/vlWAYkK/YBwk=',
    hmacText: 'Ivngd6POvQkkgVT4XZpWx5lB/ZY=',
    hmacBinKey: 'Aa49aYmFEq6Yh90BaxrxIVMCHsQ=',
    hmacLongKey: '3Dz/aY/B68Gp4IjdhpdyeR7WDbE=',
    hmacBytesMsg: '7ZrsMyRLurETJVNfo6hfDk0NBTA=',
  },
  {
    algorithm: 'sha1',
    encoding: 'base64url',
    digestAbc: 'qZk-NkcGgWq6PiVxeFDCbJzQ2J0',
    digestParts: '8rqPhKtcG86Ep7RByxlZz8cJO38',
    digestUnicode: 't4o4PiPRyeEkrHi3WHxFN6yc9xY',
    digestEmpty: '2jmj7l5rSw0yVb_vlWAYkK_YBwk',
    hmacText: 'Ivngd6POvQkkgVT4XZpWx5lB_ZY',
    hmacBinKey: 'Aa49aYmFEq6Yh90BaxrxIVMCHsQ',
    hmacLongKey: '3Dz_aY_B68Gp4IjdhpdyeR7WDbE',
    hmacBytesMsg: '7ZrsMyRLurETJVNfo6hfDk0NBTA',
  },
  {
    algorithm: 'sha256',
    encoding: 'hex',
    digestAbc: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    digestParts: 'c1cf6e465077930e88dc5136641d402f72a229ddd996f627d60e9639eaba35a6',
    digestUnicode: '48c7147b39a08ca54bca13b6c76d30e31a2023fc8ca4bc4c9708491495fa48c2',
    digestEmpty: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    hmacText: '203d1e5cedd2d18f8c5a3beff0bd9c1ebcb97097dfcb288c46b00c9227fde2c0',
    hmacBinKey: '6a4ec48fd562a9dfbe0d7808b54b112b17276bd7385155c608d174e794056c0a',
    hmacLongKey: '9cd8ce7510dd0b17df5532c548bdec05a57258f9132cb559ea6f0be1d5276f2c',
    hmacBytesMsg: '528bc8be992cf7a8389372c4fd7fba973ac59451b3a353c9701e228b09e5e1c5',
  },
  {
    algorithm: 'sha256',
    encoding: 'base64',
    digestAbc: 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
    digestParts: 'wc9uRlB3kw6I3FE2ZB1AL3KiKd3ZlvYn1g6WOeq6NaY=',
    digestUnicode: 'SMcUezmgjKVLyhO2x20w4xogI/yMpLxMlwhJFJX6SMI=',
    digestEmpty: '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
    hmacText: 'ID0eXO3S0Y+MWjvv8L2cHry5cJffyyiMRrAMkif94sA=',
    hmacBinKey: 'ak7Ej9Viqd++DXgItUsRKxcna9c4UVXGCNF055QFbAo=',
    hmacLongKey: 'nNjOdRDdCxffVTLFSL3sBaVyWPkTLLVZ6m8L4dUnbyw=',
    hmacBytesMsg: 'UovIvpks96g4k3LE/X+6lzrFlFGzo1PJcB4iiwnl4cU=',
  },
  {
    algorithm: 'sha256',
    encoding: 'base64url',
    digestAbc: 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0',
    digestParts: 'wc9uRlB3kw6I3FE2ZB1AL3KiKd3ZlvYn1g6WOeq6NaY',
    digestUnicode: 'SMcUezmgjKVLyhO2x20w4xogI_yMpLxMlwhJFJX6SMI',
    digestEmpty: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
    hmacText: 'ID0eXO3S0Y-MWjvv8L2cHry5cJffyyiMRrAMkif94sA',
    hmacBinKey: 'ak7Ej9Viqd--DXgItUsRKxcna9c4UVXGCNF055QFbAo',
    hmacLongKey: 'nNjOdRDdCxffVTLFSL3sBaVyWPkTLLVZ6m8L4dUnbyw',
    hmacBytesMsg: 'UovIvpks96g4k3LE_X-6lzrFlFGzo1PJcB4iiwnl4cU',
  },
  {
    algorithm: 'sha384',
    encoding: 'hex',
    digestAbc:
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
    digestParts:
      '9127741f2e8ad0d68e70bf5184a5b09d616e0fa32bfdf9b9248962331f202c957b76c54d7a66b34a3130503ab8678ff3',
    digestUnicode:
      '9abc4cec7175808519635a044d0c55437618d11be51df7c415e8ba36718622a70589e855905d345b6d8c66bd72544bce',
    digestEmpty:
      '38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b',
    hmacText:
      '60638fa0aa4b044fc6f50d5c4a11dd5c26863cd335e3aac16ac6434fc79505dfb05bc3d02a556e271979b41c9379f579',
    hmacBinKey:
      '6458e3d9c6749bad08f4c9c52680569ea3143c8853f8090d7b242d2aa202c87f32c82357e9470d25707480557fcc52be',
    hmacLongKey:
      'f10c7cc8621f1c18ce4b8df0c313e6ee27ca18cddb3a1972122d240fa24f293b21e48e9b5d1a11fb0d9bfac2f1ff93d1',
    hmacBytesMsg:
      '2dd7edda72fe8565921e8ff654ae1b8e52e73056fab9ea3a6d3caf2468e3f5d98e8f2306e8442f8a7a8c7b0afbd16cd3',
  },
  {
    algorithm: 'sha384',
    encoding: 'base64',
    digestAbc: 'ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn',
    digestParts: 'kSd0Hy6K0NaOcL9RhKWwnWFuD6Mr/fm5JIliMx8gLJV7dsVNemazSjEwUDq4Z4/z',
    digestUnicode: 'mrxM7HF1gIUZY1oETQxVQ3YY0RvlHffEFei6NnGGIqcFiehVkF00W22MZr1yVEvO',
    digestEmpty: 'OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb',
    hmacText: 'YGOPoKpLBE/G9Q1cShHdXCaGPNM146rBasZDT8eVBd+wW8PQKlVuJxl5tByTefV5',
    hmacBinKey: 'ZFjj2cZ0m60I9MnFJoBWnqMUPIhT+AkNeyQtKqICyH8yyCNX6UcNJXB0gFV/zFK+',
    hmacLongKey: '8Qx8yGIfHBjOS43wwxPm7ifKGM3bOhlyEi0kD6JPKTsh5I6bXRoR+w2b+sLx/5PR',
    hmacBytesMsg: 'Ldft2nL+hWWSHo/2VK4bjlLnMFb6ueo6bTyvJGjj9dmOjyMG6EQvinqMewr70WzT',
  },
  {
    algorithm: 'sha384',
    encoding: 'base64url',
    digestAbc: 'ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP_W-2AhgcroefMI1i67KE0yCWn',
    digestParts: 'kSd0Hy6K0NaOcL9RhKWwnWFuD6Mr_fm5JIliMx8gLJV7dsVNemazSjEwUDq4Z4_z',
    digestUnicode: 'mrxM7HF1gIUZY1oETQxVQ3YY0RvlHffEFei6NnGGIqcFiehVkF00W22MZr1yVEvO',
    digestEmpty: 'OLBgp1GsljhM2TJ-sbHjaiH9txEUvgdDTAzHv2P24donTt6_529l-9Ua0vFImLlb',
    hmacText: 'YGOPoKpLBE_G9Q1cShHdXCaGPNM146rBasZDT8eVBd-wW8PQKlVuJxl5tByTefV5',
    hmacBinKey: 'ZFjj2cZ0m60I9MnFJoBWnqMUPIhT-AkNeyQtKqICyH8yyCNX6UcNJXB0gFV_zFK-',
    hmacLongKey: '8Qx8yGIfHBjOS43wwxPm7ifKGM3bOhlyEi0kD6JPKTsh5I6bXRoR-w2b-sLx_5PR',
    hmacBytesMsg: 'Ldft2nL-hWWSHo_2VK4bjlLnMFb6ueo6bTyvJGjj9dmOjyMG6EQvinqMewr70WzT',
  },
  {
    algorithm: 'sha512',
    encoding: 'hex',
    digestAbc:
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    digestParts:
      '55abbe2a993e9d900dcd5e1315dbf5bc634af92500bf4242fd9c5bba38090ee043fc886018aab7fa7d855abf41162a1fcb49ef7bd56778fd6c0b9d1a7ba00a71',
    digestUnicode:
      '578f038471ef95a542ec417d435a76eaf48ba5398759d965c55cbd313087b63130a7aa5f159c13af7bf1f9353874ff4f85150caf5d9c9a452379a674c55b4374',
    digestEmpty:
      'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
    hmacText:
      '36f44b125a8a90639dc46733039571792e081e0fd8685ff746784b02ed14aa35629d562c7117cde4a701570551faa5a5e1b7ef1eb5c3bcd4cc1fdb8923fcf14e',
    hmacBinKey:
      '63585becce0ab1704afa6b869be26e35fe761d7fd9dfc3aa1df737d493c1d8e7be0bb472a94488a967305aebde83baab18933a2c6f531cd4014b3c90f9eaab70',
    hmacLongKey:
      '890e57008cc4e8ac05531601549b1ac6a190c4e04994493eeb8e17047b2aef8c899e4d37d1ceff278c189541e6c8f2323bf954898bbe9eb6c932702dec8b8383',
    hmacBytesMsg:
      'ea31e5ee310e88d558b7a4cd32f75575f4e8e4b436cae1f5d4cdf15003613bcda6dbe66fa4d7247b4d5c5bbcb22b19a28a8fdd4e958e46d53be4406a20690b42',
  },
  {
    algorithm: 'sha512',
    encoding: 'base64',
    digestAbc:
      '3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw==',
    digestParts:
      'Vau+Kpk+nZANzV4TFdv1vGNK+SUAv0JC/ZxbujgJDuBD/IhgGKq3+n2FWr9BFiofy0nve9VneP1sC50ae6AKcQ==',
    digestUnicode:
      'V48DhHHvlaVC7EF9Q1p26vSLpTmHWdllxVy9MTCHtjEwp6pfFZwTr3vx+TU4dP9PhRUMr12cmkUjeaZ0xVtDdA==',
    digestEmpty:
      'z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==',
    hmacText:
      'NvRLElqKkGOdxGczA5VxeS4IHg/YaF/3RnhLAu0UqjVinVYscRfN5KcBVwVR+qWl4bfvHrXDvNTMH9uJI/zxTg==',
    hmacBinKey:
      'Y1hb7M4KsXBK+muGm+JuNf52HX/Z38OqHfc31JPB2Oe+C7RyqUSIqWcwWuveg7qrGJM6LG9THNQBSzyQ+eqrcA==',
    hmacLongKey:
      'iQ5XAIzE6KwFUxYBVJsaxqGQxOBJlEk+644XBHsq74yJnk030c7/J4wYlUHmyPIyO/lUiYu+nrbJMnAt7IuDgw==',
    hmacBytesMsg:
      '6jHl7jEOiNVYt6TNMvdVdfTo5LQ2yuH11M3xUANhO82m2+ZvpNcke01cW7yyKxmiio/dTpWORtU75EBqIGkLQg==',
  },
  {
    algorithm: 'sha512',
    encoding: 'base64url',
    digestAbc:
      '3a81oZNherrMQXNJriBBMRLm-k6JqX6iCp7u5ktV05ohkpkqJ0_BqDa6PCOj_uu9RU1EI2Q86A4qmslPpUyknw',
    digestParts:
      'Vau-Kpk-nZANzV4TFdv1vGNK-SUAv0JC_ZxbujgJDuBD_IhgGKq3-n2FWr9BFiofy0nve9VneP1sC50ae6AKcQ',
    digestUnicode:
      'V48DhHHvlaVC7EF9Q1p26vSLpTmHWdllxVy9MTCHtjEwp6pfFZwTr3vx-TU4dP9PhRUMr12cmkUjeaZ0xVtDdA',
    digestEmpty:
      'z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg_SpIdNs6c5H0NE8XYXysP-DGNKHfuwvY7kxvUdBeoGlODJ6-SfaPg',
    hmacText:
      'NvRLElqKkGOdxGczA5VxeS4IHg_YaF_3RnhLAu0UqjVinVYscRfN5KcBVwVR-qWl4bfvHrXDvNTMH9uJI_zxTg',
    hmacBinKey:
      'Y1hb7M4KsXBK-muGm-JuNf52HX_Z38OqHfc31JPB2Oe-C7RyqUSIqWcwWuveg7qrGJM6LG9THNQBSzyQ-eqrcA',
    hmacLongKey:
      'iQ5XAIzE6KwFUxYBVJsaxqGQxOBJlEk-644XBHsq74yJnk030c7_J4wYlUHmyPIyO_lUiYu-nrbJMnAt7IuDgw',
    hmacBytesMsg:
      '6jHl7jEOiNVYt6TNMvdVdfTo5LQ2yuH11M3xUANhO82m2-ZvpNcke01cW7yyKxmiio_dTpWORtU75EBqIGkLQg',
  },
] as const;

describe('Hash gives the same text as the node:crypto implementation did', () => {
  test('the table covers every accepted algorithm and encoding', () => {
    expect(new Set<string>(ROWS.map((row) => row.algorithm))).toEqual(HashAlgorithms.SCHEME_SET);
    expect(new Set<string>(ROWS.map((row) => row.encoding))).toEqual(
      HashOutputEncodings.SCHEME_SET,
    );
  });

  for (const row of ROWS) {
    describe(`${row.algorithm} / ${row.encoding}`, () => {
      const hash = Hash.withAlgorithm(row.algorithm);
      const outputEncoding = row.encoding;

      test('digest of text, of the empty text and of unicode', () => {
        expect(hash.digest({ message: 'abc', opts: { outputEncoding } })).toBe(row.digestAbc);
        expect(hash.digest({ message: '', opts: { outputEncoding } })).toBe(row.digestEmpty);
        expect(hash.digest({ message: 'xin chào 🔐', opts: { outputEncoding } })).toBe(
          row.digestUnicode,
        );
      });

      test('digest of several parts in order, text then bytes', () => {
        const message = ['blob 3', new Uint8Array([0]), Buffer.from('abc')];

        expect(hash.digest({ message, opts: { outputEncoding } })).toBe(row.digestParts);
      });

      test('hmac with a text key, a binary key (Buffer and Uint8Array) and a long key', () => {
        const text = 'The quick brown fox';

        expect(hash.hmac({ message: text, secret: 'key', opts: { outputEncoding } })).toBe(
          row.hmacText,
        );
        expect(hash.hmac({ message: text, secret: BIN_KEY, opts: { outputEncoding } })).toBe(
          row.hmacBinKey,
        );
        expect(
          hash.hmac({ message: text, secret: Buffer.from(BIN_KEY), opts: { outputEncoding } }),
        ).toBe(row.hmacBinKey);
        expect(hash.hmac({ message: 'msg', secret: LONG_KEY, opts: { outputEncoding } })).toBe(
          row.hmacLongKey,
        );
      });

      test('hmac of a message given as bytes', () => {
        const message = new Uint8Array([1, 2, 3, 250]);

        expect(hash.hmac({ message, secret: 'key', opts: { outputEncoding } })).toBe(
          row.hmacBytesMsg,
        );
      });
    });
  }
});
