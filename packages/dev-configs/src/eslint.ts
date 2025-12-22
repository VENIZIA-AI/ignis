import mtLinterConfs from "@minimaltech/eslint-node";
import type { Linter } from "eslint";
import unicorn from "eslint-plugin-unicorn";

export const eslintConfigs: Linter.Config[] = [
  ...mtLinterConfs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    plugins: { unicorn },
    rules: {
      curly: ["error", "all"],
      "unicorn/switch-case-braces": ["error", "always"],
    },
  },
];
