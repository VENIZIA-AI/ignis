import { Hash, HashAlgorithms, HashOutputEncodings } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers/core';
import { StaticAssetErrors } from '../common/errors';
import type { IStaticAssetCommitTokenPayload } from '../common/types';

/** Signs and reads the token the commit route trusts instead of a key a caller names. */
export class StaticAssetCommitTokenUtility {
  private static encode(payload: IStaticAssetCommitTokenPayload): string {
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
  static build(opts: { payload: IStaticAssetCommitTokenPayload; secretKey: string }): string {
    const body = StaticAssetCommitTokenUtility.encode(opts.payload);

    return `${body}.${StaticAssetCommitTokenUtility.sign({ body, secretKey: opts.secretKey })}`;
  }

  /**
   * Reads a commit token back, or throws.
   *
   * Verification happens BEFORE any storage call, which is what makes the commit route refuse to be a
   * name prober: a forged token fails without a round trip, so timing says nothing about what exists.
   */
  static read(opts: {
    token: string;
    secretKey: string;
    now?: number;
  }): IStaticAssetCommitTokenPayload {
    const { token, secretKey, now = Date.now() } = opts;
    const [body, signature] = token.split('.');

    if (!body || !signature) {
      throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
    }

    if (
      !Hash.equals({
        value: signature,
        expected: StaticAssetCommitTokenUtility.sign({ body, secretKey }),
      })
    ) {
      throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
    }

    const payload: IStaticAssetCommitTokenPayload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    );

    if (payload.expiresAt <= now) {
      throw getError(StaticAssetErrors.EXPIRED_COMMIT_TOKEN);
    }

    return payload;
  }
}
