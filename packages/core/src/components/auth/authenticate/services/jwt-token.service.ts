import { inject } from '@/base/metadata';
import { BaseService } from '@/base/services';
import { HTTP } from '@/common/constants';
import { AES } from '@/helpers/crypto';
import { getError } from '@/helpers/error';
import { int } from '@/utilities';
import { Context } from 'hono';
import { JWTPayload, jwtVerify, JWTVerifyResult, SignJWT } from 'jose';
import { Authentication } from '../common/constants';
import {
  AuthenticateBindingKeys,
  IJWTTokenPayload,
  IJWTTokenServiceOptions,
  TGetTokenExpiresFn,
} from './../common';

export class JWTTokenService extends BaseService {
  static readonly JWT_COMMON_FIELDS = new Set<keyof JWTPayload>([
    'iss',
    'sub',
    'aud',
    'jti',
    'nbf',
    'exp',
    'iat',
  ]);

  protected aes: AES;
  protected jwtSecret: Uint8Array;

  constructor(
    @inject({ key: AuthenticateBindingKeys.JWT_OPTIONS })
    protected options: IJWTTokenServiceOptions,
  ) {
    super({ scope: JWTTokenService.name });

    const {
      aesAlgorithm = 'aes-256-cbc',
      jwtSecret,
      applicationSecret,
      getTokenExpiresFn,
    } = options ?? {};

    if (!jwtSecret) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[JWTTokenService] Invalid jwtSecret',
      });
    }

    if (!applicationSecret) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[JWTTokenService] Invalid applicationSecret',
      });
    }

    if (!getTokenExpiresFn) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[JWTTokenService] Invalid getTokenExpiresFn',
      });
    }

    this.aes = AES.withAlgorithm(aesAlgorithm);
    this.jwtSecret = new TextEncoder().encode(this.options.jwtSecret);
  }

  // --------------------------------------------------------------------------------------
  extractCredentials(context: Context): { type: string; token: string } {
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

  // --------------------------------------------------------------------------------------
  encryptPayload(payload: IJWTTokenPayload) {
    const rs: Record<string, string> = {};

    const keys = Object.keys(payload);
    for (const key of keys) {
      const value = payload[key];

      if (JWTTokenService.JWT_COMMON_FIELDS.has(key)) {
        rs[key] = value;
        continue;
      }

      const encryptedKey = this.aes.encrypt(key, this.options.applicationSecret);
      switch (key) {
        case 'roles': {
          rs[encryptedKey] = this.aes.encrypt(
            JSON.stringify(
              value.map(
                (el: IJWTTokenPayload['roles'][number]) =>
                  `${el.id}|${el.identifier}|${el.priority}`,
              ),
            ),
            this.options.applicationSecret,
          );
          break;
        }
        default: {
          rs[encryptedKey] = this.aes.encrypt(value, this.options.applicationSecret);
          break;
        }
      }
    }

    return rs;
  }

  // --------------------------------------------------------------------------------------
  decryptPayload(opts: { result: JWTVerifyResult<IJWTTokenPayload> }): IJWTTokenPayload {
    const { payload, protectedHeader } = opts.result;
    this.logger.debug(
      '[decryptPayload] JWT Token | payload: %j | header: %j',
      payload,
      protectedHeader,
    );

    const rs: any = {};
    for (const key in payload) {
      if (JWTTokenService.JWT_COMMON_FIELDS.has(key)) {
        rs[key] = payload[key];
        continue;
      }

      const decryptedKey = this.aes.decrypt(key, this.options.applicationSecret);
      const decryptedValue = this.aes.decrypt(payload[key], this.options.applicationSecret);

      switch (decryptedKey) {
        case 'roles': {
          rs[decryptedKey] = (JSON.parse(decryptedValue) as string[]).map(el => {
            const [id, identifier, priority] = el.split('|');
            return { id, identifier, priority: int(priority) };
          });
          break;
        }
        default: {
          rs[decryptedKey] = decryptedValue;
        }
      }
    }

    return rs;
  }

  // --------------------------------------------------------------------------------------
  async verify(opts: { type: string; token: string }) {
    const { token } = opts;
    if (!token) {
      this.logger.error('[verify] Missing token for validating request!');
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: '[verify] Invalid request token!',
      });
    }

    try {
      const decodedToken = await jwtVerify<IJWTTokenPayload>(token, this.jwtSecret, {});
      return this.decryptPayload({ result: decodedToken });
    } catch (error) {
      this.logger.error('[verify] Failed to verify token | Error: %s', error);
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: `[verify] Failed to verify token | Message: ${error.message}`,
      });
    }
  }

  // --------------------------------------------------------------------------------------
  async getSigner(opts: { payload: IJWTTokenPayload; getTokenExpiresFn: TGetTokenExpiresFn }) {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = await opts.getTokenExpiresFn();

    const encryptedPayload = this.encryptPayload(opts.payload);

    return new SignJWT(Object.assign({}, encryptedPayload))
      .setProtectedHeader({ alg: this.options.headerAlgorithm ?? 'HS256' })
      .setIssuedAt()
      .setExpirationTime(now + expiresIn)
      .setNotBefore(now);
  }

  // --------------------------------------------------------------------------------------
  async generate(opts: {
    payload: IJWTTokenPayload;
    getTokenExpiresFn?: TGetTokenExpiresFn;
  }): Promise<string> {
    const { payload, getTokenExpiresFn = this.options.getTokenExpiresFn } = opts;

    if (!payload) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: '[generate] Invalid token payload!',
      });
    }

    const signer = await this.getSigner({ payload, getTokenExpiresFn });

    try {
      return signer.sign(this.jwtSecret);
    } catch (error) {
      this.logger.error('[generate] Failed to generate token | Error: %s', error);
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[generate] Failed to generate token | Error: ${error.message}`,
      });
    }
  }
}
