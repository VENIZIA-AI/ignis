import type { TConstValue } from '@/common/types';

export class RedisModes {
  static readonly SINGLE = 'single';
  static readonly CLUSTER = 'cluster';
  static readonly SENTINEL = 'sentinel';

  static readonly SCHEME_SET = new Set([this.SINGLE, this.CLUSTER, this.SENTINEL]);

  static isValid(scheme: string): scheme is TRedisMode {
    return this.SCHEME_SET.has(scheme);
  }
}

export type TRedisMode = TConstValue<typeof RedisModes>;

export class RedisSentinelRoles {
  static readonly MASTER = 'master';
  static readonly SLAVE = 'slave';

  static readonly ROLE_SET = new Set([this.MASTER, this.SLAVE]);

  static isValid(role: string): role is TRedisSentinelRole {
    return this.ROLE_SET.has(role);
  }
}

export type TRedisSentinelRole = TConstValue<typeof RedisSentinelRoles>;
