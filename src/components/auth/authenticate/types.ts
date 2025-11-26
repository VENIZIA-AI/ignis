import { IdType } from '@/base/models';
import { ValueOrPromise } from '@/common/types';
import { AESAlgorithmType } from '@/helpers/crypto';
import { JWTPayload } from 'jose';

export interface IJWTTokenServiceOptions {
  aesAlgorithm?: AESAlgorithmType;
  headerAlgorithm?: string;
  jwtSecret: string;
  applicationSecret: string;
  getTokenExpiresFn: TGetTokenExpiresFn;
}

export interface IAuthenticateOptions {
  alwaysAllowPaths: Array<string>;

  tokenOptions?: IJWTTokenServiceOptions;
}

export interface IJWTTokenPayload extends JWTPayload {
  userId: IdType;
  roles: { id: IdType; identifier: string; priority: number }[];

  // Optional extra fields
  clientId?: string;
  provider?: string;
  email?: string;
  name?: string;

  // Unknow extra fields
  [extra: string | symbol]: any;
}

export type TGetTokenExpiresFn = () => ValueOrPromise<number>;
