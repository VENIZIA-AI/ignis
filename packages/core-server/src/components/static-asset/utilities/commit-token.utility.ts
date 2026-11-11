import { Hash, HashAlgorithms, HashOutputEncodings } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers/core';
import { StaticAssetTokenStages } from '../common/constants';
import { StaticAssetErrors } from '../common/errors';
import type { IStaticAssetCommitTokenPayload, IStaticAssetPin } from '../common/types';

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

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  /** A signed body that is not the current payload shape is refused as invalid: a token minted before the shape changed still carries a good signature. */
  private static parse(opts: { body: string }): IStaticAssetCommitTokenPayload {
    let parsed: unknown;

    try {
      parsed = JSON.parse(Buffer.from(opts.body, 'base64url').toString('utf8'));
    } catch {
      throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
    }

    if (!StaticAssetCommitTokenUtility.isRecord(parsed)) {
      throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
    }

    const { bucket, object, expiresAt, owner, stage, pin } = parsed;

    if (
      !StaticAssetCommitTokenUtility.isRecord(bucket) ||
      typeof bucket.name !== 'string' ||
      !StaticAssetCommitTokenUtility.isRecord(object) ||
      typeof object.key !== 'string' ||
      typeof expiresAt !== 'number' ||
      (owner !== undefined && typeof owner !== 'string')
    ) {
      throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
    }

    if (stage === StaticAssetTokenStages.ISSUED) {
      return {
        bucket: { name: bucket.name },
        object: { key: object.key },
        expiresAt,
        owner,
        stage,
      };
    }

    // A validated token without its pin would commit unpinned content: it is no token.
    if (stage !== StaticAssetTokenStages.VALIDATED) {
      throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
    }

    return {
      bucket: { name: bucket.name },
      object: { key: object.key },
      expiresAt,
      owner,
      stage,
      pin: StaticAssetCommitTokenUtility.parsePin({ pin }),
    };
  }

  private static parsePin(opts: { pin: unknown }): IStaticAssetPin {
    const { pin } = opts;

    if (
      !StaticAssetCommitTokenUtility.isRecord(pin) ||
      typeof pin.etag !== 'string' ||
      (pin.versionId !== undefined && typeof pin.versionId !== 'string')
    ) {
      throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
    }

    return { etag: pin.etag, versionId: pin.versionId };
  }

  /** Signs `{ bucket, object, expiresAt, owner? }` so the commit route can trust the key it is handed. */
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

    const payload = StaticAssetCommitTokenUtility.parse({ body });

    if (payload.expiresAt <= now) {
      throw getError(StaticAssetErrors.EXPIRED_COMMIT_TOKEN);
    }

    return payload;
  }
}
