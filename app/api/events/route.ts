import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';
import { validateRequired } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const supabase = createSupabaseAdmin();
    let query = supabase
      .from('events')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query
      .order('event_date', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ data, total: count });
  } catch (err) {
    return handleError(err, 'GET /api/events');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const missing = validateRequired(body, ['title', 'event_date']);
    if (missing) {
      return NextResponse.json({ error: missing }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('events')
      .insert({
        title: body.title,
        description: body.description || null,
        location: body.location || null,
        event_date: body.event_date,
        start_time: body.start_time || null,
        end_time: body.end_time || null,
        capacity: body.capacity || null,
        status: body.status || 'upcoming',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleError(err, 'POST /api/events');
  }
}
