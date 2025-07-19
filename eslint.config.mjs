import { includeIgnoreFile } from "@eslint/compat";
import pluginJs from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-config-prettier";
import pluginReact from "eslint-plugin-react";
import reactCompiler from "eslint-plugin-react-compiler";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prettierIgnorePath = path.resolve(__dirname, ".prettierignore");

/** @type {import('eslint').Linter.Config[]} */
export default [
  includeIgnoreFile(prettierIgnorePath),
  {
    ignores: ["app/scripts/**/*.js"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    plugins: {
      "react-compiler": reactCompiler,
    },
    rules: {
      "react-compiler/react-compiler": "error",
      "typescript-eslint/no-explicit-any": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  pluginReact.configs.flat.recommended,
  eslintPluginPrettierRecommended,
  ...tseslint.configs.recommended,
];
