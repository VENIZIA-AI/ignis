import { Hash, HashAlgorithms, HashOutputEncodings, RecordUtility } from '@venizia/ignis-helpers';
import { getError, type TErrorDefinition } from '@venizia/ignis-helpers/core';
import { StaticAssetErrors } from './errors';

/** What a commit token binds. Business fields are deliberately absent - which order or tenant an upload belongs to is the application's, and a token the framework signs is the wrong place to put its authorization. */
export interface ICommitTokenPayload {
  bucket: string;
  key: string;
  expiresAt: number;
}

const isCommitTokenPayload = (value: unknown): value is ICommitTokenPayload =>
  RecordUtility.isPlainRecord(value) &&
  typeof value.bucket === 'string' &&
  typeof value.key === 'string' &&
  typeof value.expiresAt === 'number';

/**
 * How a token is written and read: the piece an application replaces when it must produce, or keep accepting, a token
 * format of its own. `decode` answers `null` for anything it cannot trust (malformed, wrong signature) and never throws
 * for bad input. A codec MUST compare signatures in constant time (`Hash.equals`).
 */
export interface IAssetTokenCodec<TPayload extends object> {
  encode: (opts: { payload: TPayload; secretKey: string }) => string;
  decode: (opts: { token: string; secretKey: string }) => TPayload | null;
}

/** The codec IGNIS ships: `base64url(JSON payload) + '.' + base64url(HMAC-SHA256 of that text)`. */
export class AssetTokenCodecs {
  /**
   * Builds the default codec. `isPayload` is the application's check that a signed JSON object has the shape it expects:
   * the body is only read after its signature passed, but a payload of another shape must never reach the caller.
   */
  static signedJson<TPayload extends object>(opts: {
    isPayload: (value: unknown) => value is TPayload;
  }): IAssetTokenCodec<TPayload> {
    const sha256 = Hash.withAlgorithm(HashAlgorithms.SHA256);
    const sign = (args: { body: string; secretKey: string }) =>
      sha256.hmac({
        message: args.body,
        secret: args.secretKey,
        opts: { outputEncoding: HashOutputEncodings.BASE64URL },
      });

    return {
      encode: ({ payload, secretKey }) => {
        const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

        return `${body}.${sign({ body, secretKey })}`;
      },
      decode: ({ token, secretKey }) => {
        const [body, signature, ...rest] = token.split('.');

        if (!body || !signature || rest.length > 0) {
          return null;
        }

        if (!Hash.equals({ value: signature, expected: sign({ body, secretKey }) })) {
          return null;
        }

        try {
          const payload: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));

          return opts.isPayload(payload) ? payload : null;
          // eslint-disable-next-line venizia/no-silent-catch -- a signed body that is not JSON is the expected negative answer
        } catch {
          return null;
        }
      },
    };
  }
}

/** The definitions the token reader throws; the `errors` option takes any subset. */
export interface IAssetTokenErrors {
  /** Malformed, wrong signature, not the caller's, or refused by `validate`: all one answer, so the reader is no oracle. */
  INVALID: TErrorDefinition;
  /** Only for a token whose signature and owner are good. */
  EXPIRED: TErrorDefinition;
}

interface IAssetCommitTokenBaseOptions<TPayload extends object> {
  /** Signs every token. Keep it out of the repository and out of the client. An empty one is refused. */
  secretKey: string;

  /**
   * Who a token was issued for. Present, `verify` demands the caller's id and refuses a token whose owner is another or
   * absent. Absent, a token is not bound to anyone and `verify` refuses an `ownerId` it cannot compare.
   */
  ownerOf?: (opts: { payload: TPayload }) => string | undefined;

  /** A check on the payload of a token that is genuine, owned and alive (extension, size...). Throw the application's own error to refuse. */
  validate?: (opts: { payload: TPayload }) => void;

  /** Definitions thrown in place of the defaults (`INVALID_COMMIT_TOKEN`, `EXPIRED_COMMIT_TOKEN`). */
  errors?: Partial<IAssetTokenErrors>;

  /** The clock, in epoch milliseconds. A test seam. */
  now?: () => number;
}

/**
 * The options of a token reader. With the default payload (`ICommitTokenPayload`) the format and the expiry are the
 * default ones; any other payload names its own `codec` and `expiresAtOf`, so a token is never read with a shape it was
 * not written in.
 */
export type TAssetCommitTokenOptions<TPayload extends object> = [ICommitTokenPayload] extends [
  TPayload,
]
  ? IAssetCommitTokenBaseOptions<TPayload> & {
      /** The format. @default AssetTokenCodecs.signedJson for `ICommitTokenPayload` */
      codec?: IAssetTokenCodec<TPayload>;
      /** When a token stops being good, as epoch milliseconds; `undefined` or a non-number makes it invalid. @default payload.expiresAt */
      expiresAtOf?: (opts: { payload: TPayload }) => number | undefined;
    }
  : IAssetCommitTokenBaseOptions<TPayload> & {
      codec: IAssetTokenCodec<TPayload>;
      expiresAtOf: (opts: { payload: TPayload }) => number | undefined;
    };

/**
 * Signs and reads the token a route or a service trusts instead of a key a caller names. The default payload is what the
 * commit route binds; an application with a token of its own shape, or of its own format, configures an instance (a
 * codec, who the token is for, the expiry, a check of its own) and uses it from any service, with or without a route.
 *
 * Reading checks, in this order: the signature, the owner, the expiry, `validate`. A token that fails the first two is
 * `INVALID` whatever else is wrong with it, so an expired token of someone else is not reported as expired.
 */
export class AssetCommitToken<TPayload extends object = ICommitTokenPayload> {
  private readonly secretKey: string;
  private readonly codec: IAssetTokenCodec<TPayload>;
  private readonly expiresAtOf: (opts: { payload: TPayload }) => number | undefined;
  private readonly ownerOf?: (opts: { payload: TPayload }) => string | undefined;
  private readonly validate?: (opts: { payload: TPayload }) => void;
  private readonly errors: IAssetTokenErrors;
  private readonly now: () => number;

  constructor(opts: TAssetCommitTokenOptions<TPayload>) {
    // `Bun.CryptoHasher` given no key answers a plain SHA-256 instead of throwing, which anyone can compute: a missing
    // secret must stop here, or a forged token would pass.
    if (typeof opts.secretKey !== 'string' || opts.secretKey.trim() === '') {
      throw getError({
        message: '[AssetCommitToken] Invalid secretKey | Expected a non-empty string',
      });
    }

    this.secretKey = opts.secretKey;
    // The conditional options type cannot be narrowed here; with the default payload these are the default codec and
    // expiry, otherwise the type made them required.
    this.codec =
      opts.codec ??
      AssetTokenCodecs.signedJson<TPayload>({
        isPayload: (value): value is TPayload => isCommitTokenPayload(value),
      });
    this.expiresAtOf =
      opts.expiresAtOf ??
      (({ payload }) => {
        const expiresAt: unknown = Reflect.get(payload, 'expiresAt');

        return typeof expiresAt === 'number' ? expiresAt : undefined;
      });
    this.ownerOf = opts.ownerOf;
    this.validate = opts.validate;
    this.errors = {
      INVALID: StaticAssetErrors.INVALID_COMMIT_TOKEN,
      EXPIRED: StaticAssetErrors.EXPIRED_COMMIT_TOKEN,
      ...opts.errors,
    };
    this.now = opts.now ?? Date.now;
  }

  /** Signs a payload. */
  sign(opts: { payload: TPayload }): string {
    return this.codec.encode({ payload: opts.payload, secretKey: this.secretKey });
  }

  /**
   * Reads a token back, or throws.
   *
   * Verification happens BEFORE any storage call, which is what makes the commit route refuse to be a name
   * prober: a forged token fails without a round trip, so timing says nothing about what exists.
   */
  verify(opts: { token: string; ownerId?: string }): TPayload {
    const { token, ownerId } = opts;

    if (this.ownerOf === undefined && ownerId !== undefined) {
      throw getError({
        message:
          '[AssetCommitToken.verify] an ownerId was given but the token has no ownerOf | the check would be skipped',
      });
    }

    const payload =
      typeof token === 'string' && token !== ''
        ? this.codec.decode({ token, secretKey: this.secretKey })
        : null;

    if (payload === null) {
      throw getError({ error: this.errors.INVALID });
    }

    if (this.ownerOf !== undefined) {
      const owner = this.ownerOf({ payload });

      if (!ownerId || owner !== ownerId) {
        throw getError({ error: this.errors.INVALID });
      }
    }

    const expiresAt = this.expiresAtOf({ payload });

    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
      throw getError({ error: this.errors.INVALID });
    }

    if (expiresAt <= this.now()) {
      throw getError({ error: this.errors.EXPIRED });
    }

    this.validate?.({ payload });

    return payload;
  }

  /** `verify` for a list; the first token that fails throws, and nothing is returned. */
  verifyMany(opts: { tokens: readonly string[]; ownerId?: string }): TPayload[] {
    return opts.tokens.map((token) => this.verify({ token, ownerId: opts.ownerId }));
  }

  /** Signs `{ bucket, key, expiresAt }` so the commit route can trust the key it is handed. */
  static build(opts: { payload: ICommitTokenPayload; secretKey: string }): string {
    return new AssetCommitToken({ secretKey: opts.secretKey }).sign({ payload: opts.payload });
  }

  /** Reads a commit token back, or throws. `now` is the clock, a test seam. */
  static read(opts: { token: string; secretKey: string; now?: number }): ICommitTokenPayload {
    const { token, secretKey, now } = opts;

    return new AssetCommitToken({
      secretKey,
      now: now === undefined ? undefined : () => now,
    }).verify({ token });
  }
}
