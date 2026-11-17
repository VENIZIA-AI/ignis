/** Contract of an encryption algorithm: `encrypt` and `decrypt` take one options object holding `message`, `secret` and optional algorithm-specific `opts`. The type parameters set the input, secret and return types of each side. */
export interface ICryptoAlgorithm<
  AlgorithmNameType extends string,
  EncryptInputType = unknown,
  DecryptInputType = unknown,
  SecretKeyType = unknown,
  EncryptReturnType = unknown,
  DecryptReturnType = unknown,
  ExtraOptions = unknown,
> {
  algorithm: AlgorithmNameType;

  encrypt(opts: {
    message: EncryptInputType;
    secret: SecretKeyType;
    opts?: ExtraOptions;
  }): EncryptReturnType;
  decrypt(opts: {
    message: DecryptInputType;
    secret: SecretKeyType;
    opts?: ExtraOptions;
  }): DecryptReturnType;
}
