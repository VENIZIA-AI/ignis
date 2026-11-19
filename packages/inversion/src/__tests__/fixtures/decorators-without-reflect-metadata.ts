// Deliberately no `import 'reflect-metadata'`, and nothing from the package entry: a split chunk
// can evaluate these modules before the entry does.
import { inject } from '../../modules/metadata/injectors';
import { metadataRegistry } from '../../modules/registry';
import { BindingKeys } from '@/modules/binding/common/constants';

class Consumer {
  constructor(
    @inject({ key: BindingKeys.build<unknown>({ key: 'values.dependency' }) })
    readonly dependency: string,
  ) {}
}

const injects = metadataRegistry.getInjectMetadata({ target: Consumer });

process.stdout.write(`${String(injects?.[0]?.key)}`);
