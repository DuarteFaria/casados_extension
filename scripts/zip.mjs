// Builds dist/opto-rank-<version>.zip from extension/ for sharing or the Chrome Web Store.
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const { version } = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
const config = readFileSync("extension/config.js", "utf8");
if (/127\.0\.0\.1|localhost/.test(config.match(/CONVEX_URL\s*=\s*"([^"]+)"/)?.[1] ?? "")) {
  console.error("extension/config.js points at a local backend. Switch it to production first.");
  process.exit(1);
}

mkdirSync("dist", { recursive: true });
const out = `dist/opto-rank-${version}.zip`;
rmSync(out, { force: true });
execFileSync("zip", ["-r", "-X", `../${out}`, ".", "-x", ".*"], { cwd: "extension", stdio: "inherit" });
console.log(`Built ${out}`);
