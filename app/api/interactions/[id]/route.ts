import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseAdmin();
    await supabase.from('interactions').delete().eq('id', params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err, `DELETE /api/interactions/${params.id}`);
  }
}
