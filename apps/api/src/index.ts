import { Hono } from "hono";
import { routePath } from "hono/route";
import { runScheduledTasks } from "./scheduled";
import guestLinks from "./routes/guest/links";
import guestSubmissions from "./routes/guest/submissions";
import guestVCard from "./routes/guest/vcard";
import ownerLinks from "./routes/owner/links";
import ownerProfile from "./routes/owner/profile";
import ownerSubmissions from "./routes/owner/submissions";

export { runScheduledTasks } from "./scheduled";

const app = new Hono<{ Bindings: Env }>();

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

app.use("/api/guest/*", async (context, next) => {
  context.header("Cache-Control", "no-store");
  await next();
});

app.get("/api/health", (context) =>
  context.text("Hello, world!", 200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  })
);

app.route("/api/owner", ownerProfile);
app.route("/api/owner", ownerLinks);
app.route("/api/owner", ownerSubmissions);
app.route("/api/guest", guestLinks);
app.route("/api/guest", guestSubmissions);
app.route("/api/guest", guestVCard);

app.onError((error, context) => {
  const requestId = crypto.randomUUID();
  const stackFrames =
    error instanceof Error && error.stack
      ? error.stack
          .split("\n")
          .slice(1, 6)
          .map((frame) => frame.trim())
          .filter((frame) => frame.startsWith("at "))
      : [];

  console.error("Unhandled API exception", {
    event: "api.unhandled_exception",
    requestId,
    method: context.req.method,
    route: routePath(context) || "<unmatched>",
    errorName: error instanceof Error ? error.name : typeof error,
    stackFrames
  });

  context.header("Cache-Control", "no-store");
  context.header("X-Request-ID", requestId);
  return context.json(
    { error: { code: "internal_error", message: "An unexpected error occurred." } },
    500
  );
});

app.notFound((context) => context.text("Not found", 404));

const worker = Object.assign(app, {
  scheduled: (_controller: ScheduledController, environment: Env) => runScheduledTasks(environment)
});

export default worker;
