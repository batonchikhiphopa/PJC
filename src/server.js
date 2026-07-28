import app from "./app.js";
import { env } from "./config/env.js";
import prisma from "./lib/prisma.js";

const server = app.listen(env.PORT, (error) => {
  if (error) {
    console.error("Failed to start server:", error);
    process.exitCode = 1;
    return;
  }

  console.log(`Server is running on port ${env.PORT}`);
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} received. Closing server...`);

  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close(async (error) => {
    clearTimeout(forceExitTimer);

    if (error) {
      console.error("Failed to close server:", error);
      process.exitCode = 1;
    }

    await prisma.$disconnect();
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
