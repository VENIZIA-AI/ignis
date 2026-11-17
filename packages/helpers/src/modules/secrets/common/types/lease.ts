import type { ValueOrPromise } from '@/common/types';

/** A dynamic, lease-bearing secret (e.g. Vault `database/creds/...`). */
export interface ISecretLease {
  value: Record<string, string>;
  leaseId: string;
  ttlSeconds: number;
  renewable: boolean;
}

/** Passed to rotation handlers: the `key` that rotated and its new lease. */
export interface ISecretRotationEvent {
  key: string;
  lease: ISecretLease;
}

/** Callback run when a leased secret is renewed with new values; may be async. */
export type TSecretRotationHandler = (event: ISecretRotationEvent) => ValueOrPromise<void>;

/** A live consumer (pool holder) that rebuilds gracefully when its secret rotates. */
export interface ISecretRotatable {
  onSecretRotated(opts: { key: string; secret: Record<string, string> }): Promise<void>;
}
