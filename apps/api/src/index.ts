import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (context) =>
  context.text("Hello, world!", 200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  })
);

app.notFound((context) => context.text("Not found", 404));

export default app;