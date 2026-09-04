import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          API_KEY_PEPPER: "test-api-key-pepper",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.spec.ts"],
  },
});
