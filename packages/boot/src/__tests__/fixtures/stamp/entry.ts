import { BuildInfoRegistry } from '@venizia/ignis-helpers/core';
import { BuildInfoStamp } from '../../../build-info/stamp';

await BuildInfoStamp.register();
console.log(JSON.stringify(BuildInfoRegistry.get()));
