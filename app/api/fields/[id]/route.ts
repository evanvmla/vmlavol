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
      .from('custom_fields')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Field not found' }, { status: 404 });
      }
      throw error;
    }
    return NextResponse.json(data);
  } catch (err) {
    return handleError(err, `GET /api/fields/${params.id}`);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const supabase = createSupabaseAdmin();
    const allowed = ['name', 'field_type', 'options', 'is_required', 'display_order'];
    const updateData: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updateData[key] = body[key];
    }
    const { data, error } = await supabase
      .from('custom_fields')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return handleError(err, `PATCH /api/fields/${params.id}`);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseAdmin();

    // Remove field from all forms' field_ids arrays
    const { data: forms } = await supabase
      .from('forms')
      .select('id, field_ids')
      .contains('field_ids', [params.id]);

    if (forms && forms.length > 0) {
      for (const form of forms) {
        const updated = (form.field_ids as string[]).filter((fid: string) => fid !== params.id);
        await supabase.from('forms').update({ field_ids: updated }).eq('id', form.id);
      }
    }

    const { error } = await supabase
      .from('custom_fields')
      .delete()
      .eq('id', params.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err, `DELETE /api/fields/${params.id}`);
  }
}
