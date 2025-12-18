import { Container } from '@venizia/ignis-inversion';

export type TConstructor<T> = new (...args: any[]) => T;
export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
export type TClass<T> = TConstructor<T> & { [property: string]: any };

// ================================================================================
export interface IArtifactOptions {
  dirs?: string[];
  extensions?: string[];
  nested?: boolean;
  glob?: string;
}

export interface IBootOptions {
  controllers?: IArtifactOptions;
  services?: IArtifactOptions;
  repositories?: IArtifactOptions;
  datasources?: IArtifactOptions;
  [artifactType: string]: IArtifactOptions | undefined;
}

export type TBootPhase = 'configure' | 'discover' | 'load';

export const BOOT_PHASES: TBootPhase[] = ['configure', 'discover', 'load'];

export interface IApplication extends Container {
  getProjectRoot(): string;
}

export interface IBootableApplication {
  bootOptions?: IBootOptions;
  boot(): Promise<IBootReport>;
}

export interface IBooterOptions {
  scope: string;
  root: string;
  artifactOptions: IArtifactOptions;
}

export interface IBooter {
  configure?(): Promise<void> | void;
  discover?(): Promise<void> | void;
  load?(): Promise<void> | void;
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
export interface IArtifactStats {
  discovered: number;
  loaded: number;
  errors: number;
  files?: string[];
  errorMessages?: string[];
}

export interface IPhaseStats {
  duration: number;
  errors?: string[];
}

export interface IBootReport {
  duration: number;
  artifacts: Record<string, IArtifactStats>;
  phases: Record<TBootPhase, IPhaseStats>;
  isSuccess: boolean;
  totalLoaded: number;
  totalErrors: number;
}
