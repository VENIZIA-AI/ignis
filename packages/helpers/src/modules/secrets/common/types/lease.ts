import type { ValueOrPromise } from '@/common/types';

/** A dynamic, lease-bearing secret (e.g. Vault `database/creds/...`). */
export interface ISecretLease {
  value: Record<string, string>;
  leaseId: string;
  ttlSeconds: number;
  renewable: boolean;
}

export interface ISecretRotationEvent {
  key: string;
  lease: ISecretLease;
}

export type TSecretRotationHandler = (event: ISecretRotationEvent) => ValueOrPromise<void>;

/** A live consumer (pool holder) that rebuilds gracefully when its secret rotates. */
export interface ISecretRotatable {
  onSecretRotated(opts: { key: string; secret: Record<string, string> }): Promise<void>;
}
