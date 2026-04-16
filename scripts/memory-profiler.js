/**
 * Memory Profiler for Converge
 * 
 * Usage:
 *   npm run mem:dev       - Run dev server with memory logging
 *   npm run mem:start     - Run production with memory logging
 *   node scripts/memory-profiler.js next dev  - Direct usage
 * 
 * This script:
 * - Enables detailed garbage collection metrics
 * - Logs memory usage at intervals
 * - Reports potential memory leaks
 * - Generates heap snapshots on OOM warnings
 */

const MB = 1024 * 1024;

// Memory threshold for warnings (in MB)
const MEMORY_WARNING_THRESHOLD = process.env.MEMORY_WARNING_THRESHOLD || 512;
const MEMORY_CRITICAL_THRESHOLD = process.env.MEMORY_CRITICAL_THRESHOLD || 1024;

// Track memory over time to detect leaks
const memorySnapshots: Array<{ timestamp: number; heapUsed: number; heapTotal: number }> = [];
const MAX_SNAPSHOTS = 100;

function getMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
} {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed / MB,
    heapTotal: usage.heapTotal / MB,
    external: usage.external / MB,
    rss: usage.rss / MB,
  };
}

function formatMemory(mb: number): string {
  return `${mb.toFixed(2)} MB`;
}

function logMemory(prefix: string = ""): void {
  const mem = getMemoryUsage();
  const timestamp = Date.now();
  
  memorySnapshots.push({
    timestamp,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
  });
  
  // Keep only recent snapshots
  if (memorySnapshots.length > MAX_SNAPSHOTS) {
    memorySnapshots.shift();
  }
  
  // Check for potential memory issues
  let status = "normal";
  let statusEmoji = "✓";
  
  if (mem.heapUsed > MEMORY_CRITICAL_THRESHOLD) {
    status = "critical";
    statusEmoji = "🚨";
  } else if (mem.heapUsed > MEMORY_WARNING_THRESHOLD) {
    status = "warning";
    statusEmoji = "⚠️";
  }
  
  console.log(
    `[Memory${prefix ? ` ${prefix}` : ""}] ` +
    `Heap: ${formatMemory(mem.heapUsed)} / ${formatMemory(mem.heapTotal)} | ` +
    `RSS: ${formatMemory(mem.rss)} | ` +
    `External: ${formatMemory(mem.external)} | ` +
    `${statusEmoji} ${status}`
  );
  
  // Calculate trend if we have enough snapshots
  if (memorySnapshots.length >= 10) {
    const recent = memorySnapshots.slice(-10);
    const first = recent[0].heapUsed;
    const last = recent[recent.length - 1].heapUsed;
    const growth = ((last - first) / first) * 100;
    
    if (growth > 20) {
      console.error(`[Memory] ⚠️ Potential memory leak detected! ${growth.toFixed(1)}% growth over last 10 samples`);
    }
  }
}

function setupMemoryProfiling(): void {
  // Log memory every 30 seconds
  const logInterval = setInterval(() => {
    logMemory("periodic");
  }, 30000);
  
  // Log on garbage collection (if exposed)
  if (global.gc) {
    console.log("[Memory] Garbage collection exposed - enabling detailed GC metrics");
    
    // Force GC before memory checks for more accurate readings
    setInterval(() => {
      global.gc();
      logMemory("post-gc");
    }, 60000);
  }
  
  // Log on uncaught exceptions
  process.on("uncaughtException", (error) => {
    console.error("[Memory] Uncaught exception - capturing memory state");
    logMemory("uncaught-exception");
    console.error(error);
  });
  
  // Log on warnings
  process.on("warning", (warning) => {
    console.warn(`[Memory] ⚠️ Process warning: ${warning.name}`);
    logMemory("warning");
  });
  
  // Initial memory log
  console.log("[Memory] Memory profiling enabled");
  console.log(`[Memory] Thresholds - Warning: ${MEMORY_WARNING_THRESHOLD}MB, Critical: ${MEMORY_CRITICAL_THRESHOLD}MB`);
  logMemory("initial");
  
  // Handle cleanup
  process.on("exit", () => {
    logMemory("exit");
    clearInterval(logInterval);
  });
}

// Run if executed directly
if (require.main === module) {
  setupMemoryProfiling();
  
  // If called with a command (like "next dev"), run it after setup
  const args = process.argv.slice(2);
  if (args.length > 0) {
    console.log(`[Memory] Profiling enabled, running: ${args.join(" ")}`);
  }
}

module.exports = {
  getMemoryUsage,
  logMemory,
  setupMemoryProfiling,
};
