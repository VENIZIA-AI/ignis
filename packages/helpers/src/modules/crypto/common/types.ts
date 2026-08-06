/** The narrow slice of a cipher that string-in/string-out payload encryption needs. Both `AES` and `LegacyAES` satisfy it, so an application holding data in the pre-PBKDF2 envelope can hand over the legacy one instead of re-encrypting. */
export interface IPayloadCipher {
  encrypt(opts: { message: string; secret: string }): string;
  decrypt(opts: { message: string; secret: string }): string;
}

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
