// internationalization/read_dicts.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

process.stdout.setDefaultEncoding?.("utf8");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node internationalization/read_dicts.mjs <path-to-dicts.js>");
  process.exit(1);
}

const abs = path.resolve(process.cwd(), file);
const mod = await import(pathToFileURL(abs).href);

const DICTS = mod.DICTS;
if (!DICTS || typeof DICTS !== "object") {
  console.error("Could not find a named export DICTS in the dict module.");
  process.exit(2);
}

// Ensure UTF-8 bytes
process.stdout.write(Buffer.from(JSON.stringify(DICTS), "utf8"));