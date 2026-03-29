import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // I have made the order of the tests: unit tests, route integration and then socket tests
    include: [
      "src/auth.test.ts",
      "src/routes/*.test.ts",
      "src/socket.test.ts",
    ],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
    globalSetup: ["src/test/setup.ts"],
    env: {
      DATABASE_URL: "postgresql://postgres:Brydan999106$@localhost:5432/educationapp_test?schema=public",
      JWT_SECRET: "test-secret",
      PORT: "0",
    },
  },
});
