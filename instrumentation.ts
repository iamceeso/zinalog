export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureMonitorSchedulerStarted } = await import(
      "@/lib/monitor-scheduler"
    );
    ensureMonitorSchedulerStarted();
  }
}
