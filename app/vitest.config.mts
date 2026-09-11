import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          API_KEY_PEPPER: "test-api-key-pepper",
          SWITCHBOT_TOKEN: "test-switchbot-token",
          SWITCHBOT_SECRET: "test-switchbot-secret",
          SWITCHBOT_DEVICE_ID: "test-switchbot-device-id",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.spec.ts"],
  },
});
