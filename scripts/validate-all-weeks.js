#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { validateWeek } = require('./validate-week');

const WEEKS_DIR  = path.join(__dirname, '..', 'data', 'weeks');
const INDEX_PATH = path.join(WEEKS_DIR, 'index.json');

function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error(`index.json not found at ${INDEX_PATH}`);
    console.error('Run: node scripts/sync-weeks-index.js');
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse index.json: ${err.message}`);
    process.exit(1);
  }

  const weeks = manifest.weeks || [];
  if (!weeks.length) {
    console.log('No weeks in manifest.');
    process.exit(0);
  }

  let anyFailed = false;

  for (const entry of weeks) {
    const filePath = path.join(WEEKS_DIR, entry.file);
    const result   = validateWeek(filePath);

    if (result.pass) {
      const warnSuffix = result.warnings.length ? ` (${result.warnings.length} warning(s))` : '';
      console.log(`[PASS] ${entry.id}${warnSuffix}`);
    } else {
      console.log(`[FAIL] ${entry.id}`);
      result.errors.forEach(e => console.error(`       ${e}`));
      anyFailed = true;
    }

    if (result.warnings.length) {
      result.warnings.forEach(w => console.warn(`       WARN: ${w}`));
    }
  }

  console.log(`\nValidated ${weeks.length} week(s). ${anyFailed ? 'Some FAILED.' : 'All passed.'}`);
  process.exit(anyFailed ? 1 : 0);
}

main();
