import { TConstValue, ValueOrPromise } from '@venizia/ignis-helpers';
import { Container } from '@venizia/ignis-inversion';
import { BootPhases } from './constants';

// ================================================================================
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
  /**
   * Phases to execute
   * @default ['configure', 'discover', 'load']
   */
  phases?: TBootPhase[];
  /**
   * Specific booters to run (by name)
   * If not specified, all booters are run
   */
  booters?: string[];
}

export interface IBootstrapper {
  boot(opts: IBootExecutionOptions): Promise<IBootReport>;
}

// ================================================================================
export interface IBootReport {}
