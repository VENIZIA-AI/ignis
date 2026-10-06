import mtLinterConfs from "@minimaltech/eslint-node";
import type { Linter } from "eslint";
import unicorn from "eslint-plugin-unicorn";

export const eslintConfigs: Linter.Config[] = [
  ...mtLinterConfs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-namespace": "error",
    },
  },
  {
    plugins: { unicorn },
    rules: {
      "unicorn/switch-case-braces": ["error", "always"],
    },
  },
];
