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
      .from('volunteers')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Volunteer not found' }, { status: 404 });
      }
      throw error;
    }
    return NextResponse.json(data);
  } catch (err) {
    return handleError(err, `GET /api/volunteers/${params.id}`);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const supabase = createSupabaseAdmin();

    // Only allow updating specific fields
    const updateData: Record<string, unknown> = {};
    const allowed = [
      'first_name', 'last_name', 'email', 'phone', 'zip_code',
      'custom_data', 'tags', 'notes', 'status',
    ];
    for (const key of allowed) {
      if (key in body) updateData[key] = body[key];
    }
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('volunteers')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return handleError(err, `PATCH /api/volunteers/${params.id}`);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseAdmin();

    // Delete email_recipients first (no ON DELETE CASCADE on this FK)
    await supabase
      .from('email_recipients')
      .delete()
      .eq('volunteer_id', params.id);

    const { error } = await supabase
      .from('volunteers')
      .delete()
      .eq('id', params.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err, `DELETE /api/volunteers/${params.id}`);
  }
}
