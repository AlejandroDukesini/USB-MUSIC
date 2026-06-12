import { getLocalAddresses } from "../lib/network.js";

export function registerHealthRoutes(app) {
  app.get("/api/health", async () => ({
    ok: true,
    service: "usbmusic",
    version: "0.1.0",
    uptime: Math.round(process.uptime()),
    node: process.version,
    platform: process.platform,
    ips: getLocalAddresses(),
    wsClients: app.ws?.clientCount?.() ?? 0,
  }));
}
