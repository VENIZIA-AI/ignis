import { getError } from '@venizia/ignis-helpers/core';

/** Loads the optional peer `casbin`. The specifier stays a literal so a build embeds casbin when it is installed, and the import sits in a `try` so a build without it still succeeds - only using the casbin enforcer fails. */
export class CasbinModule {
  static async load(): Promise<typeof import('casbin')> {
    try {
      return await import('casbin');
    } catch {
      throw getError({
        message:
          '[CasbinModule] "casbin" is not installed | Install the optional peer casbin to use the casbin enforcer',
      });
    }
  }
}
