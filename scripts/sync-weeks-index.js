#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const WEEKS_DIR   = path.join(__dirname, '..', 'data', 'weeks');
const INDEX_PATH  = path.join(WEEKS_DIR, 'index.json');
const SAMPLE_FILE = 'sample-week.json';

/**
 * A published week file is named YYYY-Www.json. Everything else in the directory is
 * generated or a working artifact: the manifest, the cross-week history summary, plan and
 * notes files, and the legacy shopping-metadata files. Match the week pattern explicitly
 * rather than excluding names one at a time — the deny-list approach broke the moment
 * recent-history.json appeared.
 */
const WEEK_FILE_RE = /^\d{4}-W\d{2}\.json$/;

/**
 * ── Why this output carries no notion of "today" ──────────────────────────────────────
 *
 * CI regenerates the manifest and diff-checks it against the committed copy. Anything
 * date-derived therefore turns the passage of time into a build failure on an unrelated
 * push: commit a future-dated week, wait for the clock to enter it, and the next change to
 * data/ or scripts/ fails with "index.json is out of sync". Commit 3007d57 removed
 * `generated_at` for exactly this reason and stopped one field short — `isCurrent` and the
 * today-relative `defaultWeekId` branch were still here.
 *
 * Which week is "current" is a question about the moment the page is opened, not about the
 * moment the manifest was built, so app.js answers it from the start/end dates it already
 * has. `defaultWeekId` is now simply the newest week, or whatever --default names.
 */
function buildIndex(files, readWeek, defaultFlag = null) {
  const entries = [];
  const errors  = [];

  for (const file of files) {
    let data;
    try {
      data = readWeek(file);
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
      continue;
    }

    const week = data.week;
    if (!week || !week.id || !week.start_date || !week.end_date) {
      errors.push(`${file}: missing week.id, week.start_date, or week.end_date`);
      continue;
    }

    const expectedId = file.replace(/\.json$/, '');
    if (week.id !== expectedId) {
      errors.push(`${file}: week.id "${week.id}" does not match filename "${expectedId}"`);
      continue;
    }

    entries.push({
      id:         week.id,
      label:      week.label || week.id,
      start_date: week.start_date,
      end_date:   week.end_date,
      file,
      status:     'ready',
      notes:      week.notes || ''
    });
  }

  // Most recent first.
  entries.sort((a, b) => b.start_date.localeCompare(a.start_date));

  let defaultWeekId = null;
  if (defaultFlag && entries.some(e => e.id === defaultFlag)) {
    defaultWeekId = defaultFlag;
  } else if (entries.length) {
    defaultWeekId = entries[0].id;
  }

  return { index: { defaultWeekId, weeks: entries }, errors };
}

function parseArgs(argv) {
  const args        = argv.slice(2);
  const defaultIdx  = args.indexOf('--default');
  return {
    includeSample: args.includes('--include-sample'),
    defaultFlag:   defaultIdx !== -1 ? args[defaultIdx + 1] : null
  };
}

function main(argv) {
  const { includeSample, defaultFlag } = parseArgs(argv);

  let files;
  try {
    files = fs.readdirSync(WEEKS_DIR)
      .filter(f => WEEK_FILE_RE.test(f) || (f === SAMPLE_FILE && includeSample));
  } catch (err) {
    console.error(`Error reading directory ${WEEKS_DIR}: ${err.message}`);
    return 1;
  }

  const readWeek = file => JSON.parse(fs.readFileSync(path.join(WEEKS_DIR, file), 'utf8'));
  const { index, errors } = buildIndex(files, readWeek, defaultFlag);

  if (errors.length) {
    errors.forEach(e => console.error(`[ERROR] ${e}`));
    console.error('Aborting due to errors above.');
    return 1;
  }

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n');

  console.log(`Synced ${index.weeks.length} week(s). Default: ${index.defaultWeekId}`);
  if (includeSample) console.log('(sample-week included)');
  return 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = { buildIndex, WEEK_FILE_RE };
