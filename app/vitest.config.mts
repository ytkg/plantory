import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            API_KEY_PEPPER: "test-api-key-pepper",
            SWITCHBOT_TOKEN: "test-switchbot-token",
            SWITCHBOT_SECRET: "test-switchbot-secret",
            SWITCHBOT_DEVICE_ID: "test-switchbot-device-id",
            TEST_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    include: ["test/**/*.spec.ts"],
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
