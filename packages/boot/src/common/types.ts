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
}

export type TBootPhase = 'configure' | 'discover' | 'load';

export const BOOT_PHASES: TBootPhase[] = ['configure', 'discover', 'load'];

export interface IApplication extends Container {
  getProjectRoot(): string;
}

export interface IBootableApplication extends IApplication {
  bootOptions?: IBootOptions;
  boot(): Promise<IBootReport>;
}

export interface IBooterConfiguration {
  scope: string;
  application: IApplication;
  artifactOptions?: IArtifactOptions;
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

export interface IBootstrapperOptions {
  scope: string;
  application: IApplication;
}

export interface IBootstrapper {
  boot(opts: IBootExecutionOptions): Promise<IBootReport>;
}

// ================================================================================
/**
 * Artifact statistics
 */
export interface IArtifactStats {
  /**
   * Number of files discovered
   */
  discovered: number;

  /**
   * Number of classes loaded
   */
  loaded: number;

  /**
   * Number of errors encountered
   */
  errors: number;

  /**
   * List of discovered files
   */
  files?: string[];

  /**
   * List of error messages
   */
  errorMessages?: string[];
}

/**
 * Phase statistics
 */
export interface IPhaseStats {
  /**
   * Duration in milliseconds
   */
  duration: number;

  /**
   * Errors during this phase
   */
  errors?: string[];
}

/**
 * Boot report
 */
export interface IBootReport {
  /**
   * Total boot duration in milliseconds
   */
  duration: number;

  /**
   * Statistics per artifact type
   */
  artifacts: Record<string, IArtifactStats>;

  /**
   * Statistics per phase
   */
  phases: Record<TBootPhase, IPhaseStats>;

  /**
   * Overall success flag
   */
  success: boolean;

  /**
   * Total number of artifacts loaded
   */
  totalLoaded: number;

  /**
   * Total number of errors
   */
  totalErrors: number;
}
