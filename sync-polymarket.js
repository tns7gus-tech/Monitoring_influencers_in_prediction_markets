import { createMonitorService } from "./src/monitor-service.js";

const service = createMonitorService({ syncIntervalMs: 0 });

try {
  await service.bootstrap();
  const payload = await service.syncNow("cli");
  console.log(`Synced ${payload.snapshot.traders.length} traders.`);
  console.log(`Snapshot source: ${payload.snapshot.source}`);
  console.log(`Alerts available: ${payload.alerts.length}`);
} catch (error) {
  console.error(`Sync failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  service.close();
}
