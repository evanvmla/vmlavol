/**
 * One-time import script: instilexport.csv → volunteers table
 *
 * IMPORT FLOW:
 *   instilexport.csv
 *     │
 *     ├── csv-parse/sync → array of row objects
 *     ├── Query custom_fields → find keys for Spoken Language / How To Help
 *     ├── Map each row → volunteer record
 *     │     ├── Labels → tags[]
 *     │     ├── email (lowercase) or null
 *     │     └── Spoken Language / How To Help → custom_data
 *     ├── Upsert rows with email (onConflict: 'email')
 *     ├── Insert rows without email (no conflict possible)
 *     └── Self-verify: query count, print summary
 *
 * Usage: npx tsx scripts/import-instil.ts
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
  // 1. Read and parse CSV
  const csvPath = join(__dirname, '..', 'instilexport.csv');
  const csvContent = readFileSync(csvPath, 'utf8');
  const rows: CsvRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Parsed ${rows.length} rows from CSV`);

  // 2. Query custom_fields to find keys for our two fields
  const { data: customFields, error: cfError } = await supabase
    .from('custom_fields')
    .select('id, name, key, field_type');

  if (cfError) {
    console.error('Failed to query custom_fields:', cfError.message);
    process.exit(1);
  }

  // Match by name (case-insensitive partial match)
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

  // 3. Map rows to volunteer records
  const withEmail: Record<string, unknown>[] = [];
  const withoutEmail: Record<string, unknown>[] = [];

  for (const row of rows) {
    const email = row['Primary Email']?.trim().toLowerCase() || null;
    const firstName = row['First Name']?.trim() || '';
    const lastName = row['Last Name']?.trim() || '';

    if (!firstName && !lastName) {
      console.warn(`Skipping row with no name: ${row['Constituent Id']}`);
      continue;
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

    if (email) {
      withEmail.push(volunteer);
    } else {
      withoutEmail.push(volunteer);
    }
  }

  console.log(`\nReady to import: ${withEmail.length} with email, ${withoutEmail.length} without email`);

  // 4. Upsert rows with email (update on conflict)
  let inserted = 0;
  let errors = 0;

  if (withEmail.length > 0) {
    const { data, error } = await supabase
      .from('volunteers')
      .upsert(withEmail, { onConflict: 'email' })
      .select('id');

    if (error) {
      console.error('Upsert error (with email):', error.message);
      errors += withEmail.length;
    } else {
      inserted += data?.length || 0;
      console.log(`Upserted ${data?.length || 0} volunteers with email`);
    }
  }

  // 5. Insert rows without email (no conflict possible)
  if (withoutEmail.length > 0) {
    const { data, error } = await supabase
      .from('volunteers')
      .insert(withoutEmail)
      .select('id');

    if (error) {
      console.error('Insert error (without email):', error.message);
      errors += withoutEmail.length;
    } else {
      inserted += data?.length || 0;
      console.log(`Inserted ${data?.length || 0} volunteers without email`);
    }
  }

  // 6. Self-verify
  const { count } = await supabase
    .from('volunteers')
    .select('*', { count: 'exact', head: true });

  console.log(`\n=== IMPORT SUMMARY ===`);
  console.log(`CSV rows:       ${rows.length}`);
  console.log(`Imported:       ${inserted}`);
  console.log(`Errors:         ${errors}`);
  console.log(`Total in DB:    ${count}`);
  console.log(`=====================`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
