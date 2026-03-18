import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Form not found' }, { status: 404 });
      }
      throw error;
    }
    return NextResponse.json(data);
  } catch (err) {
    return handleError(err, `GET /api/forms/${params.id}`);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const supabase = createSupabaseAdmin();
    const allowed = ['name', 'slug', 'description', 'confirmation_message', 'welcome_email_subject', 'welcome_email_body', 'field_ids', 'is_active'];
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) updateData[key] = body[key];
    }
    const { data, error } = await supabase
      .from('forms')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return handleError(err, `PATCH /api/forms/${params.id}`);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from('forms')
      .delete()
      .eq('id', params.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err, `DELETE /api/forms/${params.id}`);
  }
}
