import "dotenv/config";
import { createServer } from "http";
import { createApp } from "../app";
import { serveStatic, setupVite } from "./vite";

async function startServer() {
  const app = createApp();
  const server = createServer(app);

  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);

  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
