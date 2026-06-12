import os from "node:os";

export function getLocalAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        out.push(net.address);
      }
    }
  }
  return out;
}
