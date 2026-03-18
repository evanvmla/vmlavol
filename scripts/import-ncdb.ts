import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

// --- Load .env.local manually ---
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    let val = trimmed.slice(eqIdx + 1);
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Strip literal \r\n or \n that Vercel sometimes adds
    val = val.replace(/\\r\\n$/g, '').replace(/\\n$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// --- Config ---
const BATCH_SIZE = 100;
const CSV_PATH = resolve(process.cwd(), 'ncdb1.csv');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

console.log(`Connecting to ${supabaseUrl}`);
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Types ---
interface CsvRow {
  council_name: string;
  council_url: string;
  category: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string;
}

interface GroupedVolunteer {
  email: string;
  first_name: string;
  last_name: string;
  tags: string[];
}

// --- Parse CSV ---
const csvContent = readFileSync(CSV_PATH, 'utf-8');
const rows: CsvRow[] = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });
console.log(`Parsed ${rows.length} CSV rows`);

// --- Group by email ---
const emailGroups = new Map<string, CsvRow[]>();
for (const row of rows) {
  const key = row.email.toLowerCase().trim();
  if (!key) continue;
  const group = emailGroups.get(key) || [];
  group.push(row);
  emailGroups.set(key, group);
}
console.log(`${emailGroups.size} unique emails`);

// --- Detect shared emails (different people using same email) ---
const sharedEmails = new Set<string>();
for (const [email, group] of emailGroups) {
  const names = new Set(group.map(r => `${r.first_name.trim().toLowerCase()}|${r.last_name.trim().toLowerCase()}`));
  if (names.size > 1) {
    sharedEmails.add(email);
  }
}
if (sharedEmails.size > 0) {
  console.log(`\nSkipping ${sharedEmails.size} shared emails (different people):`);
  for (const email of sharedEmails) {
    const names = emailGroups.get(email)!.map(r => `${r.first_name} ${r.last_name}`);
    console.log(`  ${email}: ${[...new Set(names)].join(', ')}`);
  }
}

// --- Build grouped volunteers ---
const volunteers: GroupedVolunteer[] = [];
for (const [email, group] of emailGroups) {
  if (sharedEmails.has(email)) continue;

  const first = group[0];
  const tags = new Set<string>();
  tags.add('NC');
  tags.add(first.council_name.trim());

  // First occurrence: council_name, category, title
  tags.add(first.category.trim());
  tags.add(first.title.trim());

  // Subsequent occurrences: only title
  for (let i = 1; i < group.length; i++) {
    tags.add(group[i].title.trim());
  }

  volunteers.push({
    email: first.email.trim(),
    first_name: first.first_name.trim(),
    last_name: first.last_name.trim(),
    tags: [...tags],
  });
}
console.log(`${volunteers.length} volunteers to import (after skipping shared emails)\n`);

// --- Upsert to Supabase in batches ---
async function run() {
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < volunteers.length; i += BATCH_SIZE) {
    const batch = volunteers.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(volunteers.length / BATCH_SIZE);

    // Fetch existing volunteers by email for this batch
    const emails = batch.map(v => v.email.toLowerCase());
    const { data: existing, error: fetchErr } = await supabase
      .from('volunteers')
      .select('id, email, tags')
      .in('email', emails);

    if (fetchErr) {
      console.error(`Batch ${batchNum}: fetch error:`, fetchErr.message);
      errors += batch.length;
      continue;
    }

    const existingMap = new Map((existing || []).map(v => [v.email.toLowerCase(), v]));

    // Split into inserts and updates
    const toInsert: Array<{ email: string; first_name: string; last_name: string; tags: string[] }> = [];
    const toUpdate: Array<{ id: string; tags: string[] }> = [];

    for (const vol of batch) {
      const existingVol = existingMap.get(vol.email.toLowerCase());
      if (existingVol) {
        // Merge tags (no duplicates)
        const mergedTags = [...new Set([...(existingVol.tags || []), ...vol.tags])];
        toUpdate.push({ id: existingVol.id, tags: mergedTags });
      } else {
        toInsert.push(vol);
      }
    }

    // Bulk insert new volunteers
    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase.from('volunteers').insert(toInsert);
      if (insertErr) {
        console.error(`Batch ${batchNum}: insert error:`, insertErr.message);
        errors += toInsert.length;
      } else {
        inserted += toInsert.length;
      }
    }

    // Update existing volunteers one by one (each has unique merged tags)
    for (const upd of toUpdate) {
      const { error: updErr } = await supabase
        .from('volunteers')
        .update({ tags: upd.tags })
        .eq('id', upd.id);
      if (updErr) {
        console.error(`Update error for ${upd.id}:`, updErr.message);
        errors++;
      } else {
        updated++;
      }
    }

    console.log(`Batch ${batchNum}/${totalBatches}: ${toInsert.length} inserted, ${toUpdate.length} updated`);
  }

  console.log(`\nDone! Inserted: ${inserted}, Updated: ${updated}, Errors: ${errors}`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
