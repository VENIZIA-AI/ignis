import mtLinterConfs from "@minimaltech/eslint-node";
import type { Linter } from "eslint";

export const eslintConfigs: Linter.Config[] = [
  ...mtLinterConfs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
