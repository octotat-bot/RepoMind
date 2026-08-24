/**
 * Copies shared/constants.json into the frontend source tree.
 *
 * Importing across package roots breaks Vercel's isolated builds, so the shared
 * contract is vendored in at dev/build time instead. If the source is missing
 * (deploying frontend/ alone), the existing copy is kept.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "shared", "constants.json");
const target = join(here, "..", "src", "lib", "shared-constants.json");

if (existsSync(source)) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log("✓ synced shared/constants.json");
} else if (existsSync(target)) {
  console.log("• shared/constants.json not found; using the vendored copy");
} else {
  console.error("✗ shared/constants.json is missing and no vendored copy exists");
  process.exit(1);
}
