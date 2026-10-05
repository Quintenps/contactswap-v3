import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(
        join(dirname(fileURLToPath(import.meta.url)), "migrations")
      );

      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            ADMIN_TOKEN: "test-only-admin-token",
            LINK_SIGNING_KEY: "test-only-link-signing-key-with-32-bytes",
            PUBLIC_APP_ORIGIN: "https://contactswap.pages.dev",
            TEST_MIGRATIONS: migrations
          }
        }
      };
    })
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/apply-migrations.ts"]
  }
});