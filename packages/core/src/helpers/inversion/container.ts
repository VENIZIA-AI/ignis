import { ApplicationLogger, LoggerFactory } from '@venizia/ignis-helpers';
import {
  Binding,
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

  override findByTag<T = any>(opts: {
    tag: string;
    exclude?: Array<string> | Set<string>;
  }): Binding<T>[] {
    const { tag, exclude } = opts;

    const rs: Binding<T>[] = [];

    for (const [_k, binding] of this.bindings) {
      if (!binding.hasTag(tag)) {
        continue;
      }

      if (exclude) {
        if (exclude instanceof Array && exclude.length > 0 && exclude.includes(binding.key)) {
          continue;
        }

        if (exclude instanceof Set && exclude.size > 0 && exclude.has(binding.key)) {
          continue;
        }
      }

      rs.push(binding);
    }

    return rs;
  }
}
