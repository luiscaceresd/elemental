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
    files: ["**/*.{tsx,jsx}"],
    rules: {
      // Enforce component size limitations (max 500 lines)
      "max-lines": ["error", {
        max: 500,
        skipBlankLines: false,
        skipComments: false
      }],
      // Warning when components approach the limit
      "max-lines-per-function": ["warn", {
        max: 400,
        skipBlankLines: false,
        skipComments: false,
        IIFEs: true
      }]
    }
  }
];

export default eslintConfig;
