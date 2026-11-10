import { Hash, HashAlgorithms, HashOutputEncodings } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers/core';
import { StaticAssetErrors } from './errors';

/** What a commit token binds. Business fields are deliberately absent - which order or tenant an upload belongs to is the application's, and a token the framework signs is the wrong place to put its authorization. */
export interface ICommitTokenPayload {
  bucket: string;
  key: string;
  expiresAt: number;
}

/** Signs and reads the token the commit route trusts instead of a key a caller names. */
export class AssetCommitToken {
  private static encode(payload: ICommitTokenPayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  // `Hash.hmac` refuses an empty secret: an unkeyed signature is one anyone can compute.
  private static sign(opts: { body: string; secretKey: string }): string {
    return Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({
      message: opts.body,
      secret: opts.secretKey,
      opts: { outputEncoding: HashOutputEncodings.BASE64URL },
    });
  }

  /** Signs `{ bucket, key, expiresAt }` so the commit route can trust the key it is handed. */
  static build(opts: { payload: ICommitTokenPayload; secretKey: string }): string {
    const body = AssetCommitToken.encode(opts.payload);

    return `${body}.${AssetCommitToken.sign({ body, secretKey: opts.secretKey })}`;
  }

  /**
   * Reads a commit token back, or throws.
   *
   * Verification happens BEFORE any storage call, which is what makes the commit route refuse to be a
   * name prober: a forged token fails without a round trip, so timing says nothing about what exists.
   */
  static read(opts: { token: string; secretKey: string; now?: number }): ICommitTokenPayload {
    const { token, secretKey, now = Date.now() } = opts;
    const [body, signature] = token.split('.');

    if (!body || !signature) {
      throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
    }

    if (!Hash.equals({ value: signature, expected: AssetCommitToken.sign({ body, secretKey }) })) {
      throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
    }

    const payload: ICommitTokenPayload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    );

    if (payload.expiresAt <= now) {
      throw getError(StaticAssetErrors.EXPIRED_COMMIT_TOKEN);
    }

    return payload;
  }
}
