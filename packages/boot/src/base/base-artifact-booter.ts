import { IArtifactOptions, IBooter, IBooterOptions, TClass } from '@/common/types';
import { discoverFiles, loadClasses } from '@/utilities';
import { BaseHelper, getError } from '@venizia/ignis-helpers';

export abstract class BaseArtifactBooter extends BaseHelper implements IBooter {
  protected root: string = '';
  protected artifactOptions: IArtifactOptions = {};
  protected discoveredFiles: string[] = [];
  protected loadedClasses: TClass<any>[] = [];

  protected abstract getDefaultDirs(): string[];
  protected abstract getDefaultExtensions(): string[];
  protected abstract bind(): Promise<void>;

  constructor(opts: IBooterOptions) {
    super({ scope: opts.scope });

    this.artifactOptions = opts.artifactOptions;
    this.root = opts.root;
  }

  protected getPattern(): string {
    // Use custom glob if provided
    if (this.artifactOptions.glob) {
      return this.artifactOptions.glob;
    }

    if (!this.artifactOptions.dirs?.length) {
      throw getError({
        message: `[getPattern] No directories specified for artifact discovery`,
      });
    }

    if (!this.artifactOptions.extensions?.length) {
      throw getError({
        message: `[${this.scope}][getPattern] No file extensions specified for artifact discovery`,
      });
    }

    const dirs = this.artifactOptions.dirs.join(',');
    const exts = this.artifactOptions.extensions
      .map(e => (e.startsWith('.') ? e.slice(1) : e))
      .join(',');

    const nested = this.artifactOptions.nested ? '{**/*,*}' : '*'; // NOTE: only suports one level of nesting now

    // Pattern: {dir1,dir2}/**/*.{artifact}.{ext1,ext2}
    // Example: {private-controllers,public-controllers}/**/*.controller.{js,ts}
    if (this.artifactOptions.dirs.length > 1 || this.artifactOptions.extensions.length > 1) {
      return `{${dirs}}/${nested}.{${exts}}`;
    } else {
      return `${dirs}/${nested}.${exts}`;
    }
  }

  // --------------------------------------------------------------------------------
  async configure(): Promise<void> {
    this.artifactOptions = {
      dirs: this.artifactOptions?.dirs ?? this.getDefaultDirs(),
      extensions: this.artifactOptions?.extensions ?? this.getDefaultExtensions(),
      nested: this.artifactOptions?.nested ?? true,
      glob: this.artifactOptions?.glob,
      ...this.artifactOptions,
    };

    this.logger.debug(`[configure] Configured: %j`, this.artifactOptions);
  }

  // --------------------------------------------------------------------------------
  async discover(): Promise<void> {
    const pattern = this.getPattern();

    try {
      this.discoveredFiles = []; // Reset discovered files
      this.discoveredFiles = await discoverFiles({ root: this.root, pattern });
      this.logger.debug(
        `[discover] Root: %s | Using pattern: %s | Discovered file: %j`,
        this.root,
        pattern,
        this.discoveredFiles,
      );
    } catch (error) {
      throw getError({
        message: `[discover] Failed to discover files using pattern: ${pattern} | Error: ${(error as Error)?.message}`,
      });
    }
  }

  // --------------------------------------------------------------------------------
  async load(): Promise<void> {
    if (!this.discoveredFiles.length) {
      this.logger.debug(`[load] No files discovered to load.`);
      return;
    }

    try {
      this.loadedClasses = []; // Reset loaded classes
      this.loadedClasses = await loadClasses({ files: this.discoveredFiles, root: this.root });
      await this.bind();
    } catch (error) {
      throw getError({
        message: `[load] Failed to load classes from discovered files | Error: ${(error as Error)?.message}`,
      });
    }
  }
}
