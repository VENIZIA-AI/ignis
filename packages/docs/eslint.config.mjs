import { eslintConfigs } from '@venizia/dev-configs';

const configs = [...eslintConfigs, { ignores: ['site/**'] }];

export default configs;
