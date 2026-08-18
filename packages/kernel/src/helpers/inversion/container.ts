import type { ILogger } from '@venizia/ignis-helpers/core';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import type { MetadataRegistry as _MetadataRegistry } from '@venizia/ignis-inversion';
import { Container as DIContainer } from '@venizia/ignis-inversion';
import { MetadataRegistry } from './registry';

export class Container extends DIContainer {
  logger: ILogger;

  /** Resolved through `BaseHelper`/`LoggerResolver`, never `LoggerFactory` directly - the resolver's console fallback is what keeps this constructor (and everything that extends it) browser-pure. A server host still gets the real provider: importing `LoggerFactory` as a value anywhere in the process (core's own `helpers/base-helper.ts` already does) installs it as the active resolver. */
  constructor(opts?: { scope: string }) {
    super({ scope: opts?.scope ?? Container.name });
    this.logger = new BaseHelper({ scope: opts?.scope ?? Container.name }).getLogger();
  }

  override getMetadataRegistry(): _MetadataRegistry {
    return MetadataRegistry.getInstance();
  }
}
