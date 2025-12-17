import { IContainer } from '@venizia/ignis-inversion';

export type TConstructor<T> = new (...args: any[]) => T;
export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
export type TClass<T> = TConstructor<T> & { [property: string]: any };

// ================================================================================
export interface IArtifactOptions {
  /**
   * Array of directories to scan
   * @default Artifact-specific default (e.g., ['controllers'])
   */
  dirs?: string[];

  /**
   * Array of file extensions to match
   * @default Artifact-specific default (e.g., ['.controller.js'])
   */
  extensions?: string[];

  /**
   * Whether to scan nested directories
   * @default false
   */
  nested?: boolean;

  /**
   * Custom glob pattern (overrides dirs/extensions/nested)
   * @example 'src/api/**\/*.controller.{js,ts}'
   */
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

export interface IBootableApplication extends IContainer {
  bootOptions: IBootOptions;
  getProjectRoot(): string;
}

export interface IBooterConfiguration {
  scope: string;
  application: IBootableApplication;
  artifactOptions?: IArtifactOptions;
}

export interface IBooter {
  /**
   * Phase 1: Configure booter options
   */
  configure?(): Promise<void> | void;

  /**
   * Phase 2: Discover files matching patterns
   */
  discover?(): Promise<void> | void;

  /**
   * Phase 3: Load modules and bind to application
   */
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
  application: IBootableApplication;
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
