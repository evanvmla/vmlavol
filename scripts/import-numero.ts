/**
 * One-time import script: numero.csv → volunteers table
 *
 * IMPORT FLOW:
 *   numero.csv
 *     │
 *     ├── csv-parse/sync → array of row objects
 *     ├── Fetch all existing emails from Supabase → skip duplicates
 *     ├── Map each row → volunteer record with tag "numero"
 *     │     ├── Skip if email already exists in system
 *     │     ├── Skip if no email AND no phone
 *     │     └── Trim/lowercase email
 *     ├── Insert in batches of 200
 *     └── Print summary
 *
 * Usage: npx tsx scripts/import-numero.ts
 */

import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '').replace(/\\r\\n$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface CsvRow {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  zip_code: string;
  [key: string]: string;
}

async function fetchExistingEmails(): Promise<Set<string>> {
  const emails = new Set<string>();
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('volunteers')
      .select('email')
      .not('email', 'is', null)
      .range(from, from + batchSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.email) emails.add(row.email.toLowerCase().trim());
    }

    if (data.length < batchSize) break;
    from += batchSize;
  }

  return emails;
}

async function main() {
  console.log('Reading numero.csv...');
  const csvPath = join(__dirname, '..', 'numero.csv');
  const content = readFileSync(csvPath, 'utf8');
  const rows: CsvRow[] = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`  ${rows.length} rows found`);

  console.log('Fetching existing emails from Supabase...');
  const existingEmails = await fetchExistingEmails();
  console.log(`  ${existingEmails.size} existing emails in system`);

  let skippedDuplicate = 0;
  let skippedNoContact = 0;
  const toInsert: object[] = [];
  const seenInCsv = new Set<string>();

  for (const row of rows) {
    const email = row.email?.trim().toLowerCase() || null;
    const phone = row.phone?.trim() || null;
    const firstName = row.first_name?.trim() || '';
    const lastName = row.last_name?.trim() || '';
    const zipCode = row.zip_code?.trim() || null;

    // Skip if no usable contact info
    if (!email && !phone) { skippedNoContact++; continue; }

    // Skip if email already exists in system
    if (email && existingEmails.has(email)) { skippedDuplicate++; continue; }

    // Skip duplicates within the CSV itself
    if (email && seenInCsv.has(email)) { skippedDuplicate++; continue; }
    if (email) seenInCsv.add(email);

    // Skip if no name
    if (!firstName && !lastName) { skippedNoContact++; continue; }

    toInsert.push({
      first_name: firstName || '(unknown)',
      last_name: lastName || '(unknown)',
      email: email || null,
      phone: phone || null,
      zip_code: zipCode || null,
      tags: ['numero'],
      status: 'active',
    });
  }

  console.log(`\nReady to insert: ${toInsert.length}`);
  console.log(`  Skipped (duplicate email): ${skippedDuplicate}`);
  console.log(`  Skipped (no email or phone): ${skippedNoContact}`);

  if (toInsert.length === 0) {
    console.log('\nNothing to insert. Done.');
    return;
  }

  // Insert in batches of 200
  const BATCH = 200;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await supabase.from('volunteers').insert(batch);
    if (error) {
      console.error(`  Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`\r  Inserted ${inserted}/${toInsert.length}...`);
    }
  }

  console.log(`\n\nDone.`);
  console.log(`  Inserted: ${inserted}`);
  if (errors > 0) console.log(`  Failed:   ${errors}`);

  // Verify
  const { count } = await supabase
    .from('volunteers')
    .select('*', { count: 'exact', head: true })
    .contains('tags', ['numero']);
  console.log(`\nVerification: ${count} volunteers now have tag "numero"`);
}

main().catch(err => { console.error(err); process.exit(1); });
