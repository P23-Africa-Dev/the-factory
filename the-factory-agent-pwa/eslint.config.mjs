import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "fix-all-lint.js",
    "start-dev.js",
    "scripts/**",
    "public/sw.js",
  ]),
  // Layer 5: Build-time mode boundary rules
  {
    files: ["src/features/**", "app/(agent)/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/manager/**", "../manager/**", "../../manager/**"],
              message: "Mode Boundary Violation: Agent code cannot import manager modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/manager/**", "app/manager/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/features/!(auth)/**",
                "@/features/!(auth)",
                "../features/!(auth)/**",
                "../../features/!(auth)/**",
              ],
              message: "Mode Boundary Violation: Manager code cannot import agent features directly. Use @/manager/features/* instead.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
