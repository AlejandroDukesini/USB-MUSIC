// Empaqueta el contenido de la USB en dist/usb/.
// Estructura final:
//   dist/usb/
//   |- .usbmusic-volume
//   |- autorun.sh
//   |- autorun.bat
//   |- README.txt
//   |- app/
//   |   |- server/   (src + node_modules de produccion)
//   |   |- web/dist/
//   |   `- config/
//   |- host-setup/install-host.sh + systemd/ + udev/
//   `- docs/

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist", "usb");

const log = (msg) => console.log(`[build-usb] ${msg}`);

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dst, opts = {}) {
  const { skip = () => false } = opts;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (skip(s, entry)) continue;
    if (entry.isDirectory()) copyDir(s, d, opts);
    else if (entry.isSymbolicLink()) {
      try {
        fs.symlinkSync(fs.readlinkSync(s), d);
      } catch {
        fs.copyFileSync(s, d);
      }
    } else fs.copyFileSync(s, d);
  }
}

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function sizeOf(p) {
  let total = 0;
  if (!fs.existsSync(p)) return 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const sub = path.join(p, e.name);
    total += e.isDirectory() ? sizeOf(sub) : fs.statSync(sub).size;
  }
  return total;
}

function fmtMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  log(`Limpiando ${OUT}`);
  rmrf(OUT);
  fs.mkdirSync(OUT, { recursive: true });

  // 1) Compilar el frontend si no esta
  const webDist = path.join(ROOT, "web", "dist");
  if (!fs.existsSync(webDist)) {
    log("web/dist no existe, ejecutando build...");
    execSync("npm run build", {
      cwd: path.join(ROOT, "web"),
      stdio: "inherit",
    });
  }

  // 2) Marcador y entry points
  log("Copiando entry points");
  fs.writeFileSync(
    path.join(OUT, ".usbmusic-volume"),
    "USBMUSIC volume marker\nNo borrar - usado por udev para auto-arranque.\n",
  );
  copyFile(path.join(ROOT, "boot", "autorun.sh"), path.join(OUT, "autorun.sh"));
  copyFile(
    path.join(ROOT, "boot", "autorun.bat"),
    path.join(OUT, "autorun.bat"),
  );

  // 3) App: server (sin node_modules dev) + web/dist + config
  log("Copiando server");
  copyDir(path.join(ROOT, "server"), path.join(OUT, "app", "server"), {
    skip: (p, e) => {
      const name = e.name;
      if (name === "node_modules") return true;
      if (name === ".env" || name === ".env.local") return true;
      return false;
    },
  });

  // Instalar node_modules de produccion del server dentro del paquete
  log("Instalando node_modules de produccion del server (puede tardar)");
  execSync("npm install --omit=dev --no-audit --no-fund --prefix .", {
    cwd: path.join(OUT, "app", "server"),
    stdio: "inherit",
  });

  log("Copiando web/dist");
  copyDir(webDist, path.join(OUT, "app", "web", "dist"));

  log("Copiando config");
  copyDir(path.join(ROOT, "config"), path.join(OUT, "app", "config"));

  // 4) Host setup
  log("Copiando host-setup");
  const hostSetup = path.join(OUT, "host-setup");
  fs.mkdirSync(hostSetup, { recursive: true });
  copyFile(
    path.join(ROOT, "boot", "install-host.sh"),
    path.join(hostSetup, "install-host.sh"),
  );
  copyDir(path.join(ROOT, "boot", "systemd"), path.join(hostSetup, "systemd"));
  copyDir(path.join(ROOT, "boot", "udev"), path.join(hostSetup, "udev"));

  // 5) Docs
  if (fs.existsSync(path.join(ROOT, "docs"))) {
    log("Copiando docs");
    copyDir(path.join(ROOT, "docs"), path.join(OUT, "docs"));
  }
  copyFile(path.join(ROOT, "README.md"), path.join(OUT, "README.md"));

  // 6) README.txt amigable
  fs.writeFileSync(
    path.join(OUT, "README.txt"),
    `USBMUSIC
========

Para usar en Linux / Raspberry Pi (primera vez en el host):
  cd host-setup
  sudo bash install-host.sh

Luego, conectar la USB ejecuta el server automaticamente.

Para usar en Windows:
  Doble-click autorun.bat

Para acceder desde otros dispositivos en la misma WiFi:
  http://<IP-del-host>:3000

Mas info: README.md / docs/
`,
  );

  // 7) Reporte
  const sizes = {
    total: sizeOf(OUT),
    server: sizeOf(path.join(OUT, "app", "server")),
    serverDeps: sizeOf(path.join(OUT, "app", "server", "node_modules")),
    web: sizeOf(path.join(OUT, "app", "web")),
    docs: sizeOf(path.join(OUT, "docs")),
  };

  log("---- Resultado ----");
  log(`  Total:            ${fmtMB(sizes.total)}`);
  log(`    server total:   ${fmtMB(sizes.server)}`);
  log(`      node_modules: ${fmtMB(sizes.serverDeps)}`);
  log(`    web:            ${fmtMB(sizes.web)}`);
  log(`    docs:           ${fmtMB(sizes.docs)}`);
  log(`  Salida: ${OUT}`);
  log("");
  log("Para instalar en USB:");
  log(`  cp -r dist/usb/* /media/usuario/USBMUSIC/`);
  log("  (o copialo desde el explorador de archivos)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
