import { BootSteps } from '@venizia/ignis-kernel';
import type { TConstValue } from '@venizia/ignis-helpers/common';

/** The kernel's step names plus the ones only a server runs - the full vocabulary `BaseApplication.getBootSequence()` publishes for `BootSequence.insertAfter`. */
export class ServerBootSteps extends BootSteps {
  static readonly PRINT_START_UP_INFO = 'printStartUpInfo';
  static readonly VALIDATE_ENVS = 'validateEnvs';
  static readonly HYDRATE_SECRETS = 'hydrateSecrets';
  static readonly WIRE_SECRET_ROTATABLES = 'wireSecretRotatables';
  static readonly VALIDATE_SCOPE_FILTER_SUPPORT = 'validateScopeFilterSupport';
}

/** Union of the step names in `ServerBootSteps`, accepted by `BootSequence.insertAfter` and `skipSteps`. */
export type TServerBootStep = TConstValue<typeof ServerBootSteps>;
