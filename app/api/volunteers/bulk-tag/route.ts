import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';

function validate(body: { ids?: string[]; tag?: string }) {
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return 'ids must be a non-empty array';
  }
  if (body.ids.length > 200) {
    return 'ids must not exceed 200';
  }
  if (typeof body.tag !== 'string' || body.tag.trim() === '') {
    return 'tag must be a non-empty string';
  }
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const err = validate(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const { ids, tag } = body as { ids: string[]; tag: string };
  const trimmedTag = tag.trim();
  const supabase = createSupabaseAdmin();

  const { data: volunteers, error } = await supabase
    .from('volunteers')
    .select('id, tags')
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let updated = 0;
  for (const vol of volunteers || []) {
    const existing: string[] = vol.tags || [];
    if (existing.includes(trimmedTag)) continue;

    const { error: updateErr } = await supabase
      .from('volunteers')
      .update({ tags: [...existing, trimmedTag] })
      .eq('id', vol.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    updated++;
  }

  return NextResponse.json({ updated });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const err = validate(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const { ids, tag } = body as { ids: string[]; tag: string };
  const trimmedTag = tag.trim();
  const supabase = createSupabaseAdmin();

  const { data: volunteers, error } = await supabase
    .from('volunteers')
    .select('id, tags')
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let updated = 0;
  for (const vol of volunteers || []) {
    const existing: string[] = vol.tags || [];
    if (!existing.includes(trimmedTag)) continue;

    const { error: updateErr } = await supabase
      .from('volunteers')
      .update({ tags: existing.filter(t => t !== trimmedTag) })
      .eq('id', vol.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    updated++;
  }

  return NextResponse.json({ updated });
}
