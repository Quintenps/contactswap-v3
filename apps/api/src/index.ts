import { Hono } from "hono";
import { renderVCard } from "./vcard";

const app = new Hono<{ Bindings: Env }>();

type OwnerProfile = {
  name: string;
  email: string;
  address: string;
  birthday: string;
};

type StoredOwnerProfile = OwnerProfile & { vcard: string };

function isValidBirthday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function parseProfile(value: unknown): OwnerProfile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const fields = value as Record<string, unknown>;
  if (["name", "email", "address", "birthday"].some((field) => typeof fields[field] !== "string")) {
    return null;
  }

  const profile = {
    name: (fields.name as string).trim(),
    email: (fields.email as string).trim(),
    address: (fields.address as string).trim(),
    birthday: (fields.birthday as string).trim()
  };

  if (
    !profile.name ||
    !profile.address ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) ||
    !isValidBirthday(profile.birthday) ||
    Object.hasOwn(fields, "picture")
  ) {
    return null;
  }

  return profile;
}

app.use("/api/owner/*", async (context, next) => {
  context.header("Cache-Control", "no-store");
  const adminToken = context.env.ADMIN_TOKEN;
  if (!adminToken || context.req.header("Authorization") !== `Bearer ${adminToken}`) {
    return context.json(
      { error: { code: "unauthorized", message: "Admin authorization is required." } },
      401
    );
  }

  await next();
});

app.get("/api/health", (context) =>
  context.text("Hello, world!", 200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  })
);

app.get("/api/owner/profile", async (context) => {
  const profile = await context.env.DB.prepare(
    "SELECT name, email, address, birthday FROM owner_profile WHERE id = 1"
  ).first<OwnerProfile>();

  if (!profile) {
    return context.json(
      { error: { code: "profile_not_found", message: "No owner profile has been saved." } },
      404
    );
  }

  return context.json(profile);
});

app.put("/api/owner/profile", async (context) => {
  let input: unknown;
  try {
    input = await context.req.json();
  } catch {
    return context.json(
      { error: { code: "invalid_profile", message: "The profile request is invalid." } },
      400
    );
  }

  const profile = parseProfile(input);
  if (!profile) {
    return context.json(
      { error: { code: "invalid_profile", message: "The profile request is invalid." } },
      400
    );
  }

  const vcard = renderVCard(profile);
  await context.env.DB.prepare(
    `INSERT INTO owner_profile (id, name, email, address, birthday, vcard, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       email = excluded.email,
       address = excluded.address,
       birthday = excluded.birthday,
       vcard = excluded.vcard,
       updated_at = excluded.updated_at`
  )
    .bind(
      profile.name,
      profile.email,
      profile.address,
      profile.birthday,
      vcard,
      new Date().toISOString()
    )
    .run();

  return context.json(profile);
});

app.get("/api/owner/profile/vcard", async (context) => {
  const profile = await context.env.DB.prepare(
    "SELECT vcard FROM owner_profile WHERE id = 1"
  ).first<Pick<StoredOwnerProfile, "vcard">>();

  if (!profile) {
    return context.json(
      { error: { code: "profile_not_found", message: "No owner profile has been saved." } },
      404
    );
  }

  context.header("Content-Type", "text/vcard; version=4.0; charset=utf-8");
  context.header("Content-Disposition", 'attachment; filename="contactswap-profile.vcf"');
  return context.body(profile.vcard);
});

app.onError((_error, context) => {
  context.header("Cache-Control", "no-store");
  return context.json(
    { error: { code: "internal_error", message: "An unexpected error occurred." } },
    500
  );
});

app.notFound((context) => context.text("Not found", 404));

export default app;