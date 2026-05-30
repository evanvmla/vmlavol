import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';
import { parse } from 'csv-parse/sync';

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_-]+/g, '_').trim();
}

function detectColumns(headers: string[]): {
  emailCol: string | null;
  firstNameCol: string | null;
  lastNameCol: string | null;
  nameCol: string | null;
} {
  const normalized = headers.map(normalizeHeader);

  const findCol = (matches: string[]) => {
    const idx = normalized.findIndex((h) => matches.includes(h));
    return idx >= 0 ? headers[idx] : null;
  };

  return {
    emailCol: findCol(['email', 'email_address', 'emailaddress']),
    firstNameCol: findCol(['first_name', 'firstname', 'first']),
    lastNameCol: findCol(['last_name', 'lastname', 'last']),
    nameCol: findCol(['name', 'full_name', 'fullname']),
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();

    let records: Record<string, string>[];
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      return NextResponse.json({ error: 'Could not parse CSV file' }, { status: 400 });
    }

    if (records.length === 0) {
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 });
    }

    const headers = Object.keys(records[0]);
    const { emailCol, firstNameCol, lastNameCol, nameCol } = detectColumns(headers);

    if (!emailCol) {
      return NextResponse.json(
        { error: 'CSV must have an "email" column' },
        { status: 400 }
      );
    }

    // Parse and validate rows
    const validRows: Array<{ email: string; first_name: string; last_name: string }> = [];
    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const email = (record[emailCol] ?? '').trim().toLowerCase();

      if (!email) {
        errors.push({ row: i + 2, reason: 'Missing email' });
        continue;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: i + 2, reason: `Invalid email: ${email}` });
        continue;
      }

      let firstName = '';
      let lastName = '';

      if (firstNameCol) firstName = (record[firstNameCol] ?? '').trim();
      if (lastNameCol) lastName = (record[lastNameCol] ?? '').trim();

      if (!firstName && !lastName && nameCol) {
        const fullName = (record[nameCol] ?? '').trim();
        const parts = fullName.split(/\s+/);
        firstName = parts[0] ?? '';
        lastName = parts.slice(1).join(' ');
      }

      validRows.push({ email, first_name: firstName, last_name: lastName });
    }

    if (validRows.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, errors });
    }

    const supabase = createSupabaseAdmin();

    // Find which emails already exist
    const emails = validRows.map((r) => r.email);
    const { data: existing } = await supabase
      .from('volunteers')
      .select('email')
      .in('email', emails);

    const existingEmails = new Set((existing ?? []).map((r) => r.email as string));
    const newRows = validRows.filter((r) => !existingEmails.has(r.email));

    if (newRows.length === 0) {
      return NextResponse.json({ imported: 0, skipped: validRows.length, errors });
    }

    const { error: insertError } = await supabase.from('volunteers').insert(
      newRows.map((r) => ({
        email: r.email,
        first_name: r.first_name,
        last_name: r.last_name,
        status: 'active',
        tags: [],
        custom_data: {},
      }))
    );

    if (insertError) throw insertError;

    return NextResponse.json({
      imported: newRows.length,
      skipped: validRows.length - newRows.length,
      errors,
    });
  } catch (err) {
    return handleError(err, 'POST /api/volunteers/import');
  }
}
