#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const messagesDir = path.join(process.cwd(), "messages");
const baseLocale = "en";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeMissing(base, target) {
  if (base === null || base === undefined) return target;
  if (typeof base !== "object" || Array.isArray(base)) {
    return target === undefined ? clone(base) : target;
  }

  const result = typeof target === "object" && target !== null && !Array.isArray(target) ? { ...target } : {};

  for (const [key, baseValue] of Object.entries(base)) {
    const targetValue = result[key];
    if (targetValue === undefined) {
      result[key] = clone(baseValue);
    } else {
      result[key] = mergeMissing(baseValue, targetValue);
    }
  }

  return result;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  if (!fs.existsSync(messagesDir)) {
    console.error(`messages directory not found: ${messagesDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(messagesDir).filter((f) => f.endsWith(".json")).sort();
  const baseFile = `${baseLocale}.json`;
  if (!files.includes(baseFile)) {
    console.error(`Base locale file missing: messages/${baseFile}`);
    process.exit(1);
  }

  const baseData = readJson(path.join(messagesDir, baseFile));
  let updatedLocales = 0;
  let invalidLocales = 0;

  for (const file of files) {
    if (file === baseFile) continue;
    const fullPath = path.join(messagesDir, file);
    let localeData;
    try {
      localeData = readJson(fullPath);
    } catch (error) {
      invalidLocales += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`invalid JSON in ${file}: ${message}`);
      continue;
    }
    const merged = mergeMissing(baseData, localeData);
    const before = JSON.stringify(localeData);
    const after = JSON.stringify(merged);

    if (before !== after) {
      fs.writeFileSync(fullPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      updatedLocales += 1;
      console.log(`updated ${file}`);
    }
  }

  if (updatedLocales === 0) {
    if (invalidLocales > 0) {
      console.log(`no locale files updated; ${invalidLocales} invalid locale file(s) need JSON fixes first`);
      process.exitCode = 1;
      return;
    }
    console.log("all locale files already contained all base keys");
    return;
  }

  console.log(`done: updated ${updatedLocales} locale file(s)`);
  if (invalidLocales > 0) {
    console.log(`skipped ${invalidLocales} invalid locale file(s)`);
    process.exitCode = 1;
  }
}

main();
