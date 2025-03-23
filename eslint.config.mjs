import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["**/*.md"],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      // Downgrade unused variables from errors to warnings
      "@typescript-eslint/no-unused-vars": ["warn"],
      // Downgrade no-explicit-any from error to warning
      "@typescript-eslint/no-explicit-any": ["warn"]
    }
  },
  {
    files: ["**/*.{tsx,jsx}"],
    rules: {
      // Enforce component size limitations (now as a warning, not error)
      "max-lines": ["warn", {
        max: 500,
        skipBlankLines: false,
        skipComments: false
      }],
      // Warning when components approach the line limit
      "max-lines-per-function": ["warn", {
        max: 400,
        skipBlankLines: false,
        skipComments: false,
        IIFEs: true
      }],
      // Downgrade display-name rule from error to warning
      "react/display-name": ["warn"]
    }
  }
];

export default eslintConfig;
