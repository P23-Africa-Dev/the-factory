import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
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
            "the-factory-agent-pwa/src/**/*.test.ts",
        ],
        exclude: ["backend/**", "node_modules/**"],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "."),
        },
    },
});