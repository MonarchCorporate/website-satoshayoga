// Scheduled jobs (replacement for pg_cron in the original project).
import { config } from "./config";
import { invokeFunction } from "./functions-registry";

const jobs: Record<string, { fn: string; everyMinutes: number }> = {
  // Original: pg_cron "reconcile-paypal-orders" */10 * * * *
  "reconcile-paypal-orders": { fn: "reconcile-paypal-orders", everyMinutes: 10 },
};

export async function runJob(name: string) {
  const j = jobs[name];
  if (!j) return { ok: false, error: "unknown job" };
  const res = await invokeFunction(
    j.fn,
    new Request(`${config.siteUrl}/functions/v1/${j.fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.serviceKey}`, apikey: config.serviceKey },
      body: "{}",
    }),
  );
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 2000) };
}

export function startCron() {
  if (process.env.DISABLE_CRON === "1") return;
  for (const [name, j] of Object.entries(jobs)) {
    const tick = () =>
      runJob(name)
        .then((r) => { if (!r.ok) console.warn(`[cron] ${name} -> ${r.status} ${r.body}`); })
        .catch((e) => console.error(`[cron] ${name} failed`, e));
    setTimeout(tick, 60_000);
    setInterval(tick, j.everyMinutes * 60_000).unref();
  }
}
