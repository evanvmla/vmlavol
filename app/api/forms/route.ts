import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';
import { validateRequired, sanitizeSlug } from '@/lib/validation';

export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error, count } = await supabase
      .from('forms')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data, total: count });
  } catch (err) {
    return handleError(err, 'GET /api/forms');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const missing = validateRequired(body, ['name']);
    if (missing) {
      return NextResponse.json({ error: missing }, { status: 400 });
    }

    const slug = body.slug || sanitizeSlug(body.name);
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('forms')
      .insert({
        name: body.name,
        slug,
        description: body.description || null,
        confirmation_message: body.confirmation_message || null,
        welcome_email_subject: body.welcome_email_subject || null,
        welcome_email_body: body.welcome_email_body || null,
        field_ids: body.field_ids || [],
        hidden_fields: body.hidden_fields || [],
        is_active: body.is_active !== false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A form with this slug already exists' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleError(err, 'POST /api/forms');
  }
}
