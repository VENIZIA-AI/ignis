import { getError } from '@venizia/ignis-helpers/core';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { StaticAssetErrors } from './errors';

/** What a commit token binds. Business fields are deliberately absent - which order or tenant an upload belongs to is the application's, and a token the framework signs is the wrong place to put its authorization. */
export interface ICommitTokenPayload {
  bucket: string;
  key: string;
  expiresAt: number;
}

const encode = (payload: ICommitTokenPayload): string =>
  Buffer.from(JSON.stringify(payload)).toString('base64url');

const sign = (opts: { body: string; secretKey: string }): string =>
  createHmac('sha256', opts.secretKey).update(opts.body).digest('base64url');

/** Signs `{ bucket, key, expiresAt }` so the commit route can trust the key it is handed. */
export const buildCommitToken = (opts: {
  payload: ICommitTokenPayload;
  secretKey: string;
}): string => {
  const body = encode(opts.payload);
  return `${body}.${sign({ body, secretKey: opts.secretKey })}`;
};

/**
 * Reads a commit token back, or throws.
 *
 * Verification happens BEFORE any storage call, which is what makes the commit route refuse to be a
 * name prober: a forged token fails without a round trip, so timing says nothing about what exists.
 */
export const readCommitToken = (opts: {
  token: string;
  secretKey: string;
  now?: number;
}): ICommitTokenPayload => {
  const { token, secretKey, now = Date.now() } = opts;
  const [body, signature] = token.split('.');

  if (!body || !signature) {
    throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
  }

  const expected = Buffer.from(sign({ body, secretKey }));
  const given = Buffer.from(signature);

  // Length-checked first: `timingSafeEqual` throws on a length mismatch instead of answering false.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw getError(StaticAssetErrors.INVALID_COMMIT_TOKEN);
  }

  const payload: ICommitTokenPayload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.expiresAt <= now) {
    throw getError(StaticAssetErrors.EXPIRED_COMMIT_TOKEN);
  }

  return payload;
};
