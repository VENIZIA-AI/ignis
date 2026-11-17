import type { TConstValue } from '@/common/types';

/** Role of the node a Sentinel-backed client connects to. */
export class RedisSentinelRoles {
  static readonly MASTER = 'master';
  static readonly SLAVE = 'slave';
}

/** Union of the `RedisSentinelRoles` values. */
export type TRedisSentinelRole = TConstValue<typeof RedisSentinelRoles>;

/** Defaults of the Sentinel helper. */
export class RedisSentinelDefaults {
  /** The port of a Sentinel process when none is given. */
  static readonly PORT = 26379;
}
