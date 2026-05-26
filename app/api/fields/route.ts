import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';
import { validateRequired, sanitizeSlug } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('custom_fields')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return handleError(err, 'GET /api/fields');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const missing = validateRequired(body, ['name', 'field_type']);
    if (missing) {
      return NextResponse.json({ error: missing }, { status: 400 });
    }

    const key = body.key || sanitizeSlug(body.name);
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('custom_fields')
      .insert({
        name: body.name,
        key,
        field_type: body.field_type,
        options: body.options || null,
        is_required: body.is_required || false,
        display_order: body.display_order || 0,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A field with this key already exists' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleError(err, 'POST /api/fields');
  }
}
