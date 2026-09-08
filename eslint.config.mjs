import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const typescriptFiles = ["src/**/*.{ts,tsx}", "test/**/*.ts"];

export default [
  {
    ignores: [
      "node_modules/**",
      ".wrangler/**",
      "coverage/**",
      "firmware/**",
      "worker-configuration.d.ts",
      "public/chart.umd.min.js",
      "public/marked.umd.js",
      "public/purify.min.js",
      "public/styles.css",
    ],
  },
  {
    ...tseslint.configs.recommended[0],
    files: typescriptFiles,
    languageOptions: {
      ...tseslint.configs.recommended[0].languageOptions,
      globals: globals.worker,
    },
  },
  {
    ...tseslint.configs.recommended[1],
    files: typescriptFiles,
  },
  {
    ...tseslint.configs.recommended[2],
    files: typescriptFiles,
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      globals: globals.browser,
    },
    rules: js.configs.recommended.rules,
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
    rules: js.configs.recommended.rules,
  },
];
