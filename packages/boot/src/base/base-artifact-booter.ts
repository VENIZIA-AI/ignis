import { getError } from '@/common/app-error';
import { IArtifactOptions, IBooter, IBooterConfiguration, TClass } from '@/common/types';
import { discoverFiles, loadClasses } from '@/utilities';

export abstract class BaseArtifactBooter implements IBooter {
  name: string;
  protected configuration: IBooterConfiguration;
  protected artifactOptions: IArtifactOptions = {};
  protected discoveredFiles: string[] = [];
  protected loadedClasses: TClass<any>[] = [];
  protected debug: boolean = false;

  protected abstract getDefaultDirs(): string[];
  protected abstract getDefaultExtensions(): string[];
  protected abstract bind(): Promise<void>;

  constructor(opts: IBooterConfiguration) {
    this.name = this.constructor.name;
    this.configuration = opts;
    this.debug = this.configuration?.application.bootOptions.debug ?? false;
  }

  protected getPattern(): string {
    // Use custom glob if provided
    if (this.artifactOptions.glob) {
      return this.artifactOptions.glob;
    }

    if (!this.artifactOptions.dirs?.length) {
      throw getError({
        message: `[${this.name}][getPattern] No directories specified for artifact discovery`,
      });
    }

    if (!this.artifactOptions.extensions?.length) {
      throw getError({
        message: `[${this.name}][getPattern] No file extensions specified for artifact discovery`,
      });
    }

    const dirs = this.artifactOptions.dirs.join(',');
    const exts = this.artifactOptions.extensions
      .map(e => (e.startsWith('.') ? e.slice(1) : e))
      .join(',');

    const nested = this.artifactOptions.nested ? '**/' : '';

    // Pattern: {dir1,dir2}/**/*.{artifact}.{ext1,ext2}
    // Example: {private-controllers,public-controllers}/**/*.controller.{js,ts}
    if (this.artifactOptions.dirs.length > 1 || this.artifactOptions.extensions.length > 1) {
      return `{${dirs}}/${nested}*.{${exts}}`;
    } else {
      return `${dirs}/${nested}*.${exts}`;
    }
  }

  // --------------------------------------------------------------------------------
  async configure(): Promise<void> {
    this.artifactOptions = {
      dirs: this.configuration.artifactOptions?.dirs ?? this.getDefaultDirs(),
      extensions: this.configuration.artifactOptions?.extensions ?? this.getDefaultExtensions(),
      nested: this.configuration.artifactOptions?.nested ?? false,
      glob: this.configuration.artifactOptions?.glob,
      ...this.configuration.artifactOptions,
    };

    if (this.debug) {
      console.log(`[DEBUG][${this.name}][configure] Configured:`, this.artifactOptions);
    }
  }

  // --------------------------------------------------------------------------------
  async discover(): Promise<void> {
    const pattern = this.getPattern();

    try {
      this.discoveredFiles = []; // Reset discovered files
      if (this.debug) {
        console.log(
          `[DEBUG][${this.name}][discover] Using pattern: ${pattern} | Root: ${this.configuration.application.getProjectRoot()}`,
        );
      }

      this.discoveredFiles = await discoverFiles({
        root: this.configuration.application.getProjectRoot(),
        pattern,
      });

      if (this.debug) {
        console.log(`[DEBUG][${this.name}][discover] Discovered files:`, this.discoveredFiles);
      }
    } catch (error) {
      throw getError({
        message: `[${this.name}][discover] Failed to discover files using pattern: ${pattern} | Error: ${(error as Error)?.message}`,
      });
    }
  }

  // --------------------------------------------------------------------------------
  async load(): Promise<void> {
    if (!this.discoveredFiles.length) {
      if (this.debug) {
        console.log(`[DEBUG][${this.name}][load] No files to load.`);
      }
      return;
    }

    try {
      this.loadedClasses = []; // Reset loaded classes
      this.loadedClasses = await loadClasses({
        files: this.discoveredFiles,
        root: this.configuration.application.getProjectRoot(),
      });
      await this.bind();
    } catch (error) {
      throw getError({
        message: `[${this.name}][load] Failed to load classes from discovered files | Error: ${(error as Error)?.message}`,
      });
    }
  }
}
