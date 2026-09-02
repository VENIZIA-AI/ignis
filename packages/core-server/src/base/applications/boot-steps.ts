import { BootSteps } from '@venizia/ignis-kernel';
import type { TConstValue } from '@venizia/ignis-helpers/common';

/** The kernel's step names plus the ones only a server runs - the full vocabulary `BaseApplication.getBootSequence()` publishes for `BootSequence.insertAfter`. */
export class ServerBootSteps extends BootSteps {
  static readonly PRINT_START_UP_INFO = 'printStartUpInfo';
  static readonly VALIDATE_ENVS = 'validateEnvs';
  static readonly HYDRATE_SECRETS = 'hydrateSecrets';
  static readonly WIRE_SECRET_ROTATABLES = 'wireSecretRotatables';
  static readonly VALIDATE_SCOPE_FILTER_SUPPORT = 'validateScopeFilterSupport';

  // The kernel's names plus these; `isValid` is inherited and reads this set through `this`.
  static override readonly SCHEME_SET = new Set<string>([
    ...BootSteps.SCHEME_SET,
    this.PRINT_START_UP_INFO,
    this.VALIDATE_ENVS,
    this.HYDRATE_SECRETS,
    this.WIRE_SECRET_ROTATABLES,
    this.VALIDATE_SCOPE_FILTER_SUPPORT,
  ]);
}

export type TServerBootStep = TConstValue<typeof ServerBootSteps>;
