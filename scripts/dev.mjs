// Arranca server + frontend Vite en paralelo, con colores y limpieza al salir.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const procs = [];
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function start(name, color, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, env: process.env, shell: true });
  const tag = `\x1b[${color}m[${name}]\x1b[0m`;
  p.stdout.on("data", (d) => process.stdout.write(`${tag} ${d}`));
  p.stderr.on("data", (d) => process.stderr.write(`${tag} ${d}`));
  p.on("exit", (code) => {
    console.log(`${tag} salio con codigo ${code}`);
    cleanup();
  });
  procs.push(p);
}

function cleanup() {
  for (const p of procs) {
    if (!p.killed) {
      try {
        p.kill();
      } catch {
        /* */
      }
    }
  }
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

start("server", "35", npmCmd, ["run", "dev", "--workspace=server"], ROOT);
start("web", "36", npmCmd, ["run", "dev", "--workspace=web"], ROOT);
