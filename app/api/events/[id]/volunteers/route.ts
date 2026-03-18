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
      .from('event_volunteers')
      .select('*, volunteer:volunteers(*)')
      .eq('event_id', params.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return handleError(err, `GET /api/events/${params.id}/volunteers`);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    if (!body.volunteer_id) {
      return NextResponse.json({ error: 'volunteer_id is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    // Check capacity
    const { data: event } = await supabase
      .from('events')
      .select('capacity')
      .eq('id', params.id)
      .single();

    if (event?.capacity) {
      const { count } = await supabase
        .from('event_volunteers')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', params.id)
        .neq('status', 'cancelled');

      if (count !== null && count >= event.capacity) {
        return NextResponse.json({ error: 'Event is at capacity' }, { status: 409 });
      }
    }

    const { data, error } = await supabase
      .from('event_volunteers')
      .insert({
        event_id: params.id,
        volunteer_id: body.volunteer_id,
        status: body.status || 'rsvp',
        notes: body.notes || null,
      })
      .select('*, volunteer:volunteers(*)')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Volunteer already assigned to this event' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleError(err, `POST /api/events/${params.id}/volunteers`);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    if (!body.event_volunteer_id) {
      return NextResponse.json({ error: 'event_volunteer_id is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('event_volunteers')
      .update({ status: body.status, notes: body.notes })
      .eq('id', body.event_volunteer_id)
      .eq('event_id', params.id)
      .select('*, volunteer:volunteers(*)')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return handleError(err, `PATCH /api/events/${params.id}/volunteers`);
  }
}
