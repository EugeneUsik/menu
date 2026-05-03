#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const WEEKS_DIR   = path.join(__dirname, '..', 'data', 'weeks');
const INDEX_PATH  = path.join(WEEKS_DIR, 'index.json');
const SKIP_FILES  = new Set(['index.json']);
const SAMPLE_FILE = 'sample-week.json';

function todayISO() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const includeSample = args.includes('--include-sample');
  const defaultIdx    = args.indexOf('--default');
  const defaultFlag   = defaultIdx !== -1 ? args[defaultIdx + 1] : null;
  return { includeSample, defaultFlag };
}

function main() {
  const { includeSample, defaultFlag } = parseArgs();

  let files;
  try {
    files = fs.readdirSync(WEEKS_DIR).filter(f => f.endsWith('.json'));
  } catch (err) {
    console.error(`Error reading directory ${WEEKS_DIR}: ${err.message}`);
    process.exit(1);
  }

  const today = todayISO();
  const entries = [];
  let anyError = false;

  for (const file of files) {
    if (SKIP_FILES.has(file)) continue;
    if (file === SAMPLE_FILE && !includeSample) continue;
    if (file.startsWith('_')) continue;

    const filePath = path.join(WEEKS_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`[ERROR] Failed to parse ${file}: ${err.message}`);
      anyError = true;
      continue;
    }

    const week = data.week;
    if (!week || !week.id || !week.start_date || !week.end_date) {
      console.error(`[ERROR] ${file}: missing week.id, week.start_date, or week.end_date`);
      anyError = true;
      continue;
    }

    const expectedId = file.replace('.json', '');
    if (week.id !== expectedId) {
      console.error(`[ERROR] ${file}: week.id "${week.id}" does not match filename "${expectedId}"`);
      anyError = true;
      continue;
    }

    const isCurrent = today >= week.start_date && today <= week.end_date;

    entries.push({
      id:         week.id,
      label:      week.label || week.id,
      start_date: week.start_date,
      end_date:   week.end_date,
      file,
      isCurrent,
      status:     'ready',
      notes:      week.notes || ''
    });
  }

  if (anyError) {
    console.error('Aborting due to errors above.');
    process.exit(1);
  }

  // Sort descending by start_date (most recent first)
  entries.sort((a, b) => b.start_date.localeCompare(a.start_date));

  // Resolve defaultWeekId
  let defaultWeekId = null;

  if (defaultFlag && entries.find(e => e.id === defaultFlag)) {
    defaultWeekId = defaultFlag;
  } else {
    const current = entries.find(e => e.isCurrent);
    if (current) {
      defaultWeekId = current.id;
    } else {
      // Nearest upcoming
      const upcoming = entries.filter(e => e.start_date > today);
      if (upcoming.length) {
        // Already sorted descending, so last is nearest upcoming
        defaultWeekId = upcoming[upcoming.length - 1].id;
      } else if (entries.length) {
        // Most recent past
        defaultWeekId = entries[0].id;
      }
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    defaultWeekId,
    weeks: entries
  };

  fs.writeFileSync(INDEX_PATH, JSON.stringify(output, null, 2) + '\n');

  console.log(`Synced ${entries.length} week(s). Default: ${defaultWeekId}`);
  if (includeSample) console.log('(sample-week included)');
}

main();
