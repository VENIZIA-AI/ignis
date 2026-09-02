import type { TConstValue } from '@venizia/ignis-helpers';
import { BootPhases } from './constants';

/** @deprecated Runtime file-glob boot is retired; kept so `IApplicationConfigs.bootOptions` still type-checks. Ignored. */
export interface IArtifactOptions {
  dirs?: string[];
  extensions?: string[];
  isNested?: boolean;
  glob?: string;
}

/** @deprecated See `IArtifactOptions`. */
export interface IBootOptions {
  [artifactType: string]: IArtifactOptions | undefined;
}

/** @deprecated Phases belonged to the retired Bootstrapper; `IBootReport.phases` is always empty. */
export type TBootPhase = TConstValue<typeof BootPhases>;

export interface IBootPhaseReport {
  phase: TBootPhase;
  durationMs: number;
}

/** @deprecated `boot()` is a no-op that returns an empty report; artifacts are registered from the generated index through `configs.artifacts`. */
export interface IBootReport {
  booters: string[];
  phases: IBootPhaseReport[];
  totalDurationMs: number;
}

/** @deprecated Kept for applications that still `override boot()`. */
export interface IBootableApplication {
  boot(): Promise<IBootReport>;
}
