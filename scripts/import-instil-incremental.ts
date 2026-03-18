/**
 * Incremental import: instilexport2.csv → volunteers table (new rows only)
 *
 * IMPORT FLOW:
 *   instilexport2.csv
 *     │
 *     ├── csv-parse/sync → array of row objects
 *     ├── Query existing volunteers (emails + names) for dedup
 *     ├── Query custom_fields → find keys for Spoken Language / How To Help
 *     ├── Filter CSV rows to only genuinely new signups
 *     │     ├── With email: skip if email already in DB
 *     │     └── Without email: skip if first+last name combo exists (case-insensitive)
 *     ├── Dry-run (default): print what would be imported
 *     └── --commit flag: insert new rows, print summary
 *
 * Usage:
 *   npx tsx scripts/import-instil-incremental.ts           # dry run
 *   npx tsx scripts/import-instil-incremental.ts --commit  # actually import
 */

import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually (no dotenv dependency needed)
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
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

const commit = process.argv.includes('--commit');

interface CsvRow {
  'Constituent Id': string;
  'Primary Email': string;
  'First Name': string;
  'Last Name': string;
  'Phone Numbers': string;
  'Primary Address Postal Code': string;
  'Labels': string;
  'Acknowledged': string;
  'Spoken Language': string;
  'How Would You Like To Help?': string;
  'Profile URL': string;
}

async function main() {
  console.log(commit ? '=== COMMIT MODE ===' : '=== DRY RUN (pass --commit to write) ===');
  console.log();

  // 1. Read and parse CSV
  const csvPath = join(__dirname, '..', 'instilexport2.csv');
  const csvContent = readFileSync(csvPath, 'utf8');
  const rows: CsvRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Parsed ${rows.length} rows from instilexport2.csv`);

  // 2. Fetch all existing volunteers for dedup
  const { data: existing, error: existErr } = await supabase
    .from('volunteers')
    .select('email, first_name, last_name');

  if (existErr) {
    console.error('Failed to query existing volunteers:', existErr.message);
    process.exit(1);
  }

  const existingEmails = new Set(
    (existing || [])
      .map((v) => v.email?.toLowerCase())
      .filter(Boolean)
  );

  const existingNames = new Set(
    (existing || [])
      .filter((v) => !v.email)
      .map((v) => `${(v.first_name || '').toLowerCase()}|${(v.last_name || '').toLowerCase()}`)
  );

  console.log(`Existing in DB: ${existing?.length || 0} volunteers (${existingEmails.size} with email, ${existingNames.size} name-only)`);

  // 3. Query custom_fields for our two fields
  const { data: customFields, error: cfError } = await supabase
    .from('custom_fields')
    .select('id, name, key, field_type');

  if (cfError) {
    console.error('Failed to query custom_fields:', cfError.message);
    process.exit(1);
  }

  const langField = customFields?.find((f) =>
    f.name.toLowerCase().includes('spoken language') ||
    f.name.toLowerCase().includes('language')
  );
  const helpField = customFields?.find((f) =>
    f.name.toLowerCase().includes('how would you like to help') ||
    f.name.toLowerCase().includes('how to help') ||
    f.name.toLowerCase().includes('help')
  );

  console.log(`Language field: ${langField ? `"${langField.name}" (key: ${langField.key})` : 'NOT FOUND — will skip'}`);
  console.log(`Help field: ${helpField ? `"${helpField.name}" (key: ${helpField.key})` : 'NOT FOUND — will skip'}`);

  // 4. Map rows and filter to only new signups
  const toInsert: Record<string, unknown>[] = [];
  let skippedEmail = 0;
  let skippedName = 0;
  let skippedNoName = 0;

  for (const row of rows) {
    const email = row['Primary Email']?.trim().toLowerCase() || null;
    const firstName = row['First Name']?.trim() || '';
    const lastName = row['Last Name']?.trim() || '';

    if (!firstName && !lastName) {
      skippedNoName++;
      continue;
    }

    // Dedup check
    if (email) {
      if (existingEmails.has(email)) {
        skippedEmail++;
        continue;
      }
    } else {
      const nameKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
      if (existingNames.has(nameKey)) {
        skippedName++;
        continue;
      }
    }

    // Parse Labels → tags
    const labelsRaw = row['Labels']?.trim() || '';
    const tags = labelsRaw
      ? labelsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    // Parse custom data
    const customData: Record<string, string[]> = {};

    if (langField) {
      const langRaw = row['Spoken Language']?.trim() || '';
      if (langRaw) {
        customData[langField.key] = langRaw.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    if (helpField) {
      const helpRaw = row['How Would You Like To Help?']?.trim() || '';
      if (helpRaw) {
        customData[helpField.key] = helpRaw.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    const volunteer = {
      email: email || null,
      first_name: firstName,
      last_name: lastName,
      phone: row['Phone Numbers']?.trim() || null,
      zip_code: row['Primary Address Postal Code']?.trim() || null,
      tags,
      custom_data: customData,
      status: 'active' as const,
    };

    toInsert.push(volunteer);
  }

  // 5. Print what we found
  console.log();
  console.log(`--- Dedup results ---`);
  console.log(`Skipped (email exists):    ${skippedEmail}`);
  console.log(`Skipped (name exists):     ${skippedName}`);
  console.log(`Skipped (no name):         ${skippedNoName}`);
  console.log(`New volunteers to import:  ${toInsert.length}`);
  console.log();

  if (toInsert.length > 0) {
    console.log('New volunteers:');
    for (const v of toInsert) {
      console.log(`  - ${v.first_name} ${v.last_name}${v.email ? ` <${v.email}>` : ' (no email)'}`);
    }
    console.log();
  }

  // 6. Insert if committing
  if (!commit) {
    console.log('Dry run complete. Pass --commit to actually import.');
    return;
  }

  if (toInsert.length === 0) {
    console.log('Nothing to insert.');
    return;
  }

  const { data, error } = await supabase
    .from('volunteers')
    .insert(toInsert)
    .select('id');

  if (error) {
    console.error('Insert error:', error.message);
    process.exit(1);
  }

  console.log(`Inserted ${data?.length || 0} new volunteers.`);

  // 7. Verify total
  const { count } = await supabase
    .from('volunteers')
    .select('*', { count: 'exact', head: true });

  console.log();
  console.log(`=== IMPORT SUMMARY ===`);
  console.log(`CSV rows:       ${rows.length}`);
  console.log(`Skipped:        ${skippedEmail + skippedName + skippedNoName}`);
  console.log(`Inserted:       ${data?.length || 0}`);
  console.log(`Total in DB:    ${count}`);
  console.log(`=====================`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
