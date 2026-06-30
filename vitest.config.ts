import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = __dirname;
const agentSrc = path.resolve(rootDir, "the-factory-agent-pwa/src");

export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: "root",
                    environment: "jsdom",
                    setupFiles: ["./tests/setup.ts"],
                    globals: true,
                    clearMocks: true,
                    restoreMocks: true,
                    mockReset: true,
                    include: [
                        "hooks/**/*.test.ts",
                        "hooks/**/*.test.tsx",
                        "lib/**/*.test.ts",
                        "lib/**/*.test.tsx",
                        "components/**/*.test.ts",
                        "components/**/*.test.tsx",
                    ],
                    exclude: ["backend/**", "node_modules/**", "the-factory-agent-pwa/**"],
                },
                resolve: {
                    alias: {
                        "@": rootDir,
                    },
                },
            },
            {
                test: {
                    name: "agent-pwa",
                    environment: "jsdom",
                    setupFiles: ["./tests/setup.ts"],
                    globals: true,
                    clearMocks: true,
                    restoreMocks: true,
                    mockReset: true,
                    include: ["the-factory-agent-pwa/src/**/*.test.ts"],
                    exclude: ["backend/**", "node_modules/**"],
                },
                resolve: {
                    alias: {
                        "@": agentSrc,
                    },
                },
            },
        ],
    },
});
