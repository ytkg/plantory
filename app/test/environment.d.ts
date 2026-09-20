/// <reference types="@cloudflare/vitest-plugin/types" />

declare namespace Cloudflare {
  interface Env {
    API_KEY_PEPPER: string;
    SWITCHBOT_TOKEN: string;
    SWITCHBOT_SECRET: string;
    SWITCHBOT_DEVICE_ID: string;
    TEST_MIGRATIONS: D1Migration[];
  }
}
