import { archiveOldBattles } from "./db.js";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function startCleanupJob(): void {
  const run = async () => {
    try {
      const count = await archiveOldBattles();
      if (count > 0) {
        console.error(`[Cleanup] Archived ${count} finished battle(s) older than 7 days.`);
      }
    } catch (e) {
      console.error("[Cleanup] Error during cleanup:", e);
    }
  };

  // Run once at startup, then every hour
  run();
  setInterval(run, INTERVAL_MS);
  console.error("[Cleanup] Job scheduled (every 1h, archives battles >7 days old).");
}
