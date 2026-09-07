// `@venizia/dev-configs` does not resolve here - `scripts/` is not a workspace member, so bun
// never links it into a local `node_modules`. Import the built package directly.
import { prettierConfigs } from '../packages/dev-configs/dist/prettier.js';

export default prettierConfigs;
