import { TContext } from '@/base/controllers/common/types';
import { BaseService } from '@/base/services/base';
import { AES, AESAlgorithmType, getError, HTTP, ValueOrPromise } from '@venizia/ignis-helpers';
import { Env } from 'hono';
import { JWTPayload, JWTVerifyResult, SignJWT } from 'jose';
import {
  Authentication,
  IJWTTokenPayload,
  IPayloadFieldCodec,
  TGetTokenExpiresFn,
} from '../../common';

/** Abstract base for Bearer-token services (JWS, JWKS) with optional AES payload encryption. */
export abstract class AbstractBearerTokenService<E extends Env = Env> extends BaseService {
  /** Standard JWT fields that are never encrypted. */
  static readonly JWT_COMMON_FIELDS = new Set<keyof JWTPayload>([
    'iss',
    'sub',
    'aud',
    'jti',
    'nbf',
    'exp',
    'iat',
  ]);

  protected aes: AES | null = null;
  protected applicationSecret: string | null = null;
  protected fieldCodecs: Map<string, IPayloadFieldCodec> = new Map();

  /** Configures AES payload encryption and field codecs. Both aesAlgorithm and applicationSecret required to activate encryption. */
  protected configurePayloadEncryption(opts: {
    aesAlgorithm?: AESAlgorithmType;
    applicationSecret?: string;
    fieldCodecs?: IPayloadFieldCodec[];
  }): void {
    const { aesAlgorithm = 'aes-256-cbc', applicationSecret, fieldCodecs } = opts;

    if (fieldCodecs) {
      for (const codec of fieldCodecs) {
        this.fieldCodecs.set(codec.key, codec);
      }
    }

    if (!applicationSecret) {
      return;
    }

    this.aes = AES.withAlgorithm(aesAlgorithm);
    this.applicationSecret = applicationSecret;
  }

  extractCredentials(context: TContext<E, string>): { type: string; token: string } {
    const request = context.req;

    const authHeaderValue = request.header('Authorization');
    if (!authHeaderValue) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Unauthorized user! Missing authorization header',
      });
    }

    if (!authHeaderValue.startsWith(Authentication.TYPE_BEARER)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Unauthorized user! Invalid schema of request token!',
      });
    }

    const parts = authHeaderValue.split(' ');
    if (parts.length !== 2) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: `Authorization header value is invalid format. It must follow the pattern: 'Bearer xx.yy.zz' where xx.yy.zz is a valid JWT token.`,
      });
    }

    const [tokenType, tokenValue] = parts;
    return { type: tokenType, token: tokenValue };
  }

  async verify(opts: { type: string; token: string }): Promise<IJWTTokenPayload> {
    const { token } = opts;
    if (!token) {
      this.logger.for(this.verify.name).error('Missing token for validating request!');
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: '[verify] Invalid request token!',
      });
    }

    try {
      return await this.doVerify(token);
    } catch (error) {
      this.logger.for(this.verify.name).error('Failed to verify token | Error: %s', error);
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: '[verify] Invalid or expired token',
      });
    }
  }

  async generate(opts: {
    payload: IJWTTokenPayload;
    getTokenExpiresFn?: TGetTokenExpiresFn;
  }): Promise<string> {
    const { payload, getTokenExpiresFn = this.getDefaultTokenExpiresFn() } = opts;

    if (!payload) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: '[generate] Invalid token payload!',
      });
    }

    const signer = await this.getSigner({ payload, getTokenExpiresFn });

    try {
      const rs = await signer.sign(await this.getSigningKey());
      return rs;
    } catch (error) {
      this.logger.for(this.generate.name).error('Failed to generate token | Error: %s', error);
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[generate] Failed to generate token',
      });
    }
  }

  protected serializeField(opts: { key: string; value: any }): string {
    const { key, value } = opts;
    const codec = this.fieldCodecs.get(key);

    if (codec) {
      return codec.serialize({ value });
    }

    return JSON.stringify(value);
  }

  encryptPayload(payload: IJWTTokenPayload): Record<string, any> {
    if (!this.aes || !this.applicationSecret) {
      return payload;
    }

    const rs: Record<string, string> = {};

    const keys = Object.keys(payload);
    for (const key of keys) {
      const value = payload[key];

      if (AbstractBearerTokenService.JWT_COMMON_FIELDS.has(key)) {
        rs[key] = value;
        continue;
      }

      // NOTE: Skip undefined or null values because they cannot be encrypted
      if (value === undefined || value === null) {
        continue;
      }

      const encryptedKey = this.aes.encrypt({
        message: key,
        secret: this.applicationSecret,
      });

      const serialized = this.serializeField({ key, value });

      rs[encryptedKey] = this.aes.encrypt({
        message: serialized,
        secret: this.applicationSecret,
      });
    }

    return rs;
  }

  protected deserializeField(opts: { key: string; value: string }) {
    const { key, value } = opts;
    const codec = this.fieldCodecs.get(key);

    if (codec) {
      return codec.deserialize({ raw: value });
    }

    return JSON.parse(value);
  }

  decryptPayload(opts: { result: JWTVerifyResult<IJWTTokenPayload> }): IJWTTokenPayload {
    const { payload, protectedHeader } = opts.result;

    if (!this.aes || !this.applicationSecret) {
      return payload as IJWTTokenPayload;
    }

    this.logger
      .for(this.decryptPayload.name)
      .debug('JWT Token | payload: %j | header: %j', payload, protectedHeader);

    const rs: any = {};
    for (const key in payload) {
      if (AbstractBearerTokenService.JWT_COMMON_FIELDS.has(key)) {
        rs[key] = payload[key];
        continue;
      }

      const decryptedKey = this.aes.decrypt({
        message: key,
        secret: this.applicationSecret,
      });
      const decryptedValue = this.aes.decrypt({
        message: payload[key],
        secret: this.applicationSecret,
      });

      rs[decryptedKey] = this.deserializeField({ key: decryptedKey, value: decryptedValue });
    }

    return rs;
  }

  protected abstract doVerify(token: string): Promise<IJWTTokenPayload>;

  abstract getSigner(opts: {
    payload: IJWTTokenPayload;
    getTokenExpiresFn: TGetTokenExpiresFn;
  }): Promise<SignJWT>;

  protected abstract getSigningKey(): ValueOrPromise<Uint8Array | CryptoKey>;

  protected abstract getDefaultTokenExpiresFn(): TGetTokenExpiresFn;
}
