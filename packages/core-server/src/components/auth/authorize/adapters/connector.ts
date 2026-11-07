import { getError } from '@venizia/ignis-helpers/core';
import type { ICasbinPolicySource, TCasbinPolicyConnector } from './common';

/** Connector-resolution logic shared by every adapter/loader reading the casbin policy store. */
export class PolicyConnectorResolver {
  /** Resolve the wired connector off a policy datasource, once the datasource is open (one that opens on first use opens here). */
  static async resolve(opts: {
    source: ICasbinPolicySource;
    caller: string;
  }): Promise<TCasbinPolicyConnector> {
    const { source, caller } = opts;

    await source.ensureOpen?.();

    const resolved = source.getConnector?.() ?? source.connector;

    if (!resolved) {
      throw getError({
        message: `[${caller}] datasource exposes neither a getConnector() accessor nor a wired connector - pass a datasource whose getConnector() lazily wires the driver.`,
      });
    }

    return resolved;
  }
}
