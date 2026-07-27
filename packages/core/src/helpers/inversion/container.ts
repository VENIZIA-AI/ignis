import type { ILogger } from '@venizia/ignis-helpers';
import { LoggerFactory } from '@venizia/ignis-helpers';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { Container as DIContainer } from '@venizia/ignis-inversion';
import { MetadataRegistry } from './registry';

export class Container extends DIContainer {
  logger: ILogger;

  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? Container.name });
    this.logger = LoggerFactory.getLogger([opts?.scope ?? Container.name]);
  }

  override getMetadataRegistry(): _MetadataRegistry {
    return MetadataRegistry.getInstance();
  }
}
