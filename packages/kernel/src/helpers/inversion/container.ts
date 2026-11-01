import type { ILogger } from '@venizia/ignis-helpers/core';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { Container as DIContainer } from '@venizia/ignis-inversion';
import { MetadataRegistry } from './registry';

export class Container extends DIContainer {
  logger: ILogger;

  /** Resolved through `BaseHelper`, which asks `LoggerFactory` (browser-pure, the console by default). A server host gets the provider the application chose, or Winston when it chose none. */
  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? Container.name });
    this.logger = new BaseHelper({ scope: opts?.scope ?? Container.name }).getLogger();
  }

  override getMetadataRegistry(): _MetadataRegistry {
    return MetadataRegistry.getInstance();
  }
}
