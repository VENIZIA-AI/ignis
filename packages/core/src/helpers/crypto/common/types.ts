export interface ICryptoAlgorithm<AL extends string, IO> {
  algorithm: AL;

  encrypt: (message: string, secret: string, opts?: IO) => string;
  decrypt: (message: string, secret: string, opts?: IO) => string;
}
