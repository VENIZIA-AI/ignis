import { TConstValue, ValueOrPromise } from '@venizia/ignis-helpers';
import { Container } from '@venizia/ignis-inversion';
import { BootPhases } from './constants';

export interface IArtifactOptions {
  dirs?: string[];
  extensions?: string[];
  isNested?: boolean;
  glob?: string;
}

export interface IBootOptions {
  controllers?: IArtifactOptions;
  services?: IArtifactOptions;
  repositories?: IArtifactOptions;
  datasources?: IArtifactOptions;
  [artifactType: string]: IArtifactOptions | undefined;
}

export type TBootPhase = TConstValue<typeof BootPhases>;

export const BOOT_PHASES: TBootPhase[] = ['configure', 'discover', 'load'];

export interface IApplication extends Container {
  getProjectRoot(): string;
}

export interface IBootableApplication {
  boot(): Promise<IBootReport>;
}

export interface IBooterOptions {
  scope: string;
  root: string;
  artifactOptions: IArtifactOptions;
}

export interface IBooter {
  configure(): ValueOrPromise<void>;
  discover(): ValueOrPromise<void>;
  load(): ValueOrPromise<void>;
}

export interface IBootExecutionOptions {
  phases?: TBootPhase[];
  booters?: string[];
}

export interface IBootstrapper {
  boot(opts: IBootExecutionOptions): Promise<IBootReport>;
}

export interface IBootPhaseReport {
  phase: TBootPhase;
  durationMs: number;
}

export interface IBootReport {
  /** Class names of the booters that actually ran, in execution order. */
  booters: string[];
  phases: IBootPhaseReport[];
  totalDurationMs: number;
}
