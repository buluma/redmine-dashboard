#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const messagesDir = path.join(process.cwd(), "messages");
const baseLocale = "en";

function flattenKeys(value, prefix = "", output = new Set()) {
  if (value === null || value === undefined) return output;
  if (typeof value !== "object" || Array.isArray(value)) {
    if (prefix) output.add(prefix);
    return output;
  }
  for (const [key, nested] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    flattenKeys(nested, next, output);
  }
  return output;
}

function readLocaleFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return { ok: true, data: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function diffKeys(baseSet, localeSet) {
  const missing = [];
  const extra = [];

  for (const key of baseSet) {
    if (!localeSet.has(key)) missing.push(key);
  }
  for (const key of localeSet) {
    if (!baseSet.has(key)) extra.push(key);
  }

  return { missing: missing.sort(), extra: extra.sort() };
}

function main() {
  if (!fs.existsSync(messagesDir)) {
    console.error(`messages directory not found: ${messagesDir}`);
    process.exit(1);
  }

  const localeFiles = fs
    .readdirSync(messagesDir)
    .filter((file) => file.endsWith(".json"))
    .sort();

  if (localeFiles.length === 0) {
    console.error("No locale files found in messages/.");
    process.exit(1);
  }

  const baseFile = `${baseLocale}.json`;
  if (!localeFiles.includes(baseFile)) {
    console.error(`Base locale file missing: messages/${baseFile}`);
    process.exit(1);
  }

  const baseResult = readLocaleFile(path.join(messagesDir, baseFile));
  if (!baseResult.ok) {
    console.error(`Failed parsing ${baseFile}: ${baseResult.error}`);
    process.exit(1);
  }

  const baseKeys = flattenKeys(baseResult.data);
  let hasIssues = false;

  console.log(`Base locale: ${baseLocale} (${baseKeys.size} leaf keys)\n`);

  for (const file of localeFiles) {
    if (file === baseFile) continue;
    const locale = file.replace(/\.json$/, "");
    const fullPath = path.join(messagesDir, file);
    const result = readLocaleFile(fullPath);

    if (!result.ok) {
      hasIssues = true;
      console.log(`- ${locale}: INVALID JSON`);
      console.log(`  Parse error: ${result.error}\n`);
      continue;
    }

    const localeKeys = flattenKeys(result.data);
    const { missing, extra } = diffKeys(baseKeys, localeKeys);
    const missingPct = ((missing.length / baseKeys.size) * 100).toFixed(1);

    if (missing.length > 0 || extra.length > 0) hasIssues = true;

    console.log(`- ${locale}: ${localeKeys.size}/${baseKeys.size} keys, ${missing.length} missing (${missingPct}%), ${extra.length} extra`);

    if (missing.length > 0) {
      const preview = missing.slice(0, 10).join(", ");
      console.log(`  Missing sample: ${preview}${missing.length > 10 ? ", ..." : ""}`);
    }
    if (extra.length > 0) {
      const preview = extra.slice(0, 10).join(", ");
      console.log(`  Extra sample: ${preview}${extra.length > 10 ? ", ..." : ""}`);
    }
    console.log("");
  }

  if (hasIssues) {
    process.exitCode = 1;
    console.log("i18n audit failed: locale mismatches found.");
    return;
  }

  console.log("i18n audit passed: all locales match base keys.");
}

main();
