// Copies the production build into the CodeIgniter 4 public folder so one
// server hosts both the API and the app (index.html is served as app.html).
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";

const dist = "dist";
const target = "backend/public";

if (!existsSync(`${dist}/index.html`)) {
  console.error("dist/index.html tidak ditemukan. Jalankan vite build terlebih dahulu.");
  process.exit(1);
}

rmSync(`${target}/assets`, { recursive: true, force: true });
cpSync(dist, target, { recursive: true });
renameSync(`${target}/index.html`, `${target}/app.html`);
console.log("Frontend disalin ke backend/public (app.html + assets/).");
