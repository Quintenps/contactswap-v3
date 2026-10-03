import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

type TestEnv = Env & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

await applyD1Migrations(env.DB, (env as TestEnv).TEST_MIGRATIONS);