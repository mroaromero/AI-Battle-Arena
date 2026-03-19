import { archiveOldBattles } from "./db.js";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let _handle: ReturnType<typeof setInterval> | null = null;

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
  _handle = setInterval(run, INTERVAL_MS);
  console.error("[Cleanup] Job scheduled (every 1h, archives battles >7 days old).");
}

export function stopCleanupJob(): void {
  if (_handle) {
    clearInterval(_handle);
    _handle = null;
    console.error("[Cleanup] Job stopped.");
  }
}
