import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';

const MANUAL_TYPES = ['note', 'call', 'meeting', 'other'];

export async function GET(request: NextRequest) {
  try {
    const volunteerId = request.nextUrl.searchParams.get('volunteer_id');
    if (!volunteerId) {
      return NextResponse.json({ error: 'volunteer_id is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('interactions')
      .select('*')
      .eq('volunteer_id', volunteerId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return handleError(err, 'GET /api/interactions');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.volunteer_id) {
      return NextResponse.json({ error: 'volunteer_id is required' }, { status: 400 });
    }
    if (!body.description) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }
    if (!body.type || !MANUAL_TYPES.includes(body.type)) {
      const valid = MANUAL_TYPES.join(', ');
      return NextResponse.json(
        { error: `type must be one of: ${valid}` },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('interactions')
      .insert({
        volunteer_id: body.volunteer_id,
        type: body.type,
        description: body.description,
        metadata: body.metadata || {},
        created_by: body.created_by || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleError(err, 'POST /api/interactions');
  }
}
