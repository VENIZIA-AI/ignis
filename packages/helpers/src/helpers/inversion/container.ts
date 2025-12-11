import {
  Container as _Container,
  MetadataRegistry as _MetadataRegistry,
} from '@venizia/ignis-inversion';
import { ApplicationLogger, LoggerFactory } from '../logger';
import { MetadataRegistry } from './registry';

// -------------------------------------------------------------------------------------
export class Container extends _Container {
  logger: ApplicationLogger;

  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? Container.name });
    this.logger = LoggerFactory.getLogger([opts?.scope ?? Container.name]);
  }

  override getMetadataRegistry(): _MetadataRegistry {
    return MetadataRegistry.getInstance();
  }
}
