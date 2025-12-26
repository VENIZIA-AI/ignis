import { ApplicationLogger, LoggerFactory } from '@venizia/ignis-helpers';
import {
  Container as DIContainer,
  MetadataRegistry as _MetadataRegistry,
} from '@venizia/ignis-inversion';
import { MetadataRegistry } from './registry';

// -------------------------------------------------------------------------------------
export class Container extends DIContainer {
  logger: ApplicationLogger;

  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? Container.name });
    this.logger = LoggerFactory.getLogger([opts?.scope ?? Container.name]);
  }

  override getMetadataRegistry(): _MetadataRegistry {
    return MetadataRegistry.getInstance();
  }
}
