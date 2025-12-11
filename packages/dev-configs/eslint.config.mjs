import mtLinterConfs from "@minimaltech/eslint-node";

export default [
  ...mtLinterConfs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
