import type { NotificationJob } from "./api-types";

export async function runScheduledTasks(environment: Env): Promise<void> {
  const now = new Date().toISOString();
  const expiredSubmissions = await environment.DB.prepare(
    "SELECT photo_key FROM guest_submissions WHERE expires_at <= ? AND photo_key IS NOT NULL"
  )
    .bind(now)
    .all<{ photo_key: string }>();

  for (const { photo_key: photoKey } of expiredSubmissions.results) {
    await environment.PHOTOS.delete(photoKey);
  }

  await environment.DB.prepare("DELETE FROM guest_submissions WHERE expires_at <= ?")
    .bind(now)
    .run();

  const dueJobs = await environment.DB.prepare(
    `SELECT id, attempts FROM notification_outbox
     WHERE next_attempt_at <= ? ORDER BY next_attempt_at LIMIT 10`
  )
    .bind(now)
    .all<NotificationJob>();

  for (const job of dueJobs.results) {
    try {
      const response = await fetch(environment.WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "@everyone A new contact was submitted through ContactSwap.",
          allowed_mentions: { parse: ["everyone"] }
        })
      });
      if (!response.ok) {
        throw new Error("Webhook delivery failed.");
      }

      await environment.DB.prepare("DELETE FROM notification_outbox WHERE id = ?")
        .bind(job.id)
        .run();
    } catch {
      const attempts = job.attempts + 1;
      const delayMinutes = Math.min(2 ** Math.min(attempts, 10), 24 * 60);
      const retryAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
      await environment.DB.prepare(
        "UPDATE notification_outbox SET attempts = ?, next_attempt_at = ? WHERE id = ?"
      )
        .bind(attempts, retryAt, job.id)
        .run();
    }
  }
}
