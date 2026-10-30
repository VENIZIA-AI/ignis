import { getError } from '@venizia/ignis-helpers/core';
import { createHmac, timingSafeEqual } from 'node:crypto';
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

  private static sign(opts: { body: string; secretKey: string }): string {
    return createHmac('sha256', opts.secretKey).update(opts.body).digest('base64url');
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

    const expected = Buffer.from(AssetCommitToken.sign({ body, secretKey }));
    const given = Buffer.from(signature);

    // Length-checked first: `timingSafeEqual` throws on a length mismatch instead of answering false.
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
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

/** @deprecated Use `AssetCommitToken.build({ payload, secretKey })`. Removed in 0.5. */
export const buildCommitToken = (opts: {
  payload: ICommitTokenPayload;
  secretKey: string;
}): string => AssetCommitToken.build(opts);

/** @deprecated Use `AssetCommitToken.read({ token, secretKey, now })`. Removed in 0.5. */
export const readCommitToken = (opts: {
  token: string;
  secretKey: string;
  now?: number;
}): ICommitTokenPayload => AssetCommitToken.read(opts);
