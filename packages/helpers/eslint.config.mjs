import { eslintConfigs } from "@venizia/dev-configs";

export default [
  { ignores: ["src/__tests__/.kafka/"] },
  ...eslintConfigs,
];