import "dotenv/config";
import { httpServer, io } from "./app.js";

const PORT = Number(process.env.PORT ?? 4000);

let retried = false;

function startServer() {
  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE" && !retried) {
    retried = true;
    console.log(`Port ${PORT} busy — retrying in 500ms...`);
    setTimeout(startServer, 500);
  } else if (err.code === "EADDRINUSE") {
    console.error(`\nPort ${PORT} is still in use after retry.`);
    console.error(`Run: netstat -ano | findstr :${PORT}   to find the process,`);
    console.error(`then: taskkill /PID <pid> /F            to stop it.\n`);
    process.exit(1);
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});

startServer();

function shutdown() {
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
