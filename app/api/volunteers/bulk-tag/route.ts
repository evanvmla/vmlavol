import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';

function parseBody(body: unknown): { ids: string[]; tag: string } | string {
  if (!body || typeof body !== 'object') return 'Invalid request body';
  const { ids, tag } = body as Record<string, unknown>;
  if (!Array.isArray(ids) || ids.length === 0) return 'ids must be a non-empty array';
  if (ids.length > 200) return 'ids cannot exceed 200';
  if (!ids.every((id) => typeof id === 'string')) return 'ids must be strings';
  if (typeof tag !== 'string' || tag.trim() === '') return 'tag must be a non-empty string';
  return { ids, tag: tag.trim() };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(body);
    if (typeof parsed === 'string') {
      return NextResponse.json({ error: parsed }, { status: 400 });
    }
    const { ids, tag } = parsed;

    const supabase = createSupabaseAdmin();
    const { data: volunteers, error } = await supabase
      .from('volunteers')
      .select('id, tags')
      .in('id', ids);

    if (error) throw error;

    const toUpdate = (volunteers || []).filter(
      (v) => !(v.tags || []).includes(tag)
    );

    for (const vol of toUpdate) {
      const { error: updateError } = await supabase
        .from('volunteers')
        .update({ tags: [...(vol.tags || []), tag], updated_at: new Date().toISOString() })
        .eq('id', vol.id);
      if (updateError) throw updateError;
    }

    return NextResponse.json({ updated: toUpdate.length });
  } catch (err) {
    return handleError(err, 'POST /api/volunteers/bulk-tag');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(body);
    if (typeof parsed === 'string') {
      return NextResponse.json({ error: parsed }, { status: 400 });
    }
    const { ids, tag } = parsed;

    const supabase = createSupabaseAdmin();
    const { data: volunteers, error } = await supabase
      .from('volunteers')
      .select('id, tags')
      .in('id', ids);

    if (error) throw error;

    const toUpdate = (volunteers || []).filter(
      (v) => (v.tags || []).includes(tag)
    );

    for (const vol of toUpdate) {
      const { error: updateError } = await supabase
        .from('volunteers')
        .update({
          tags: (vol.tags || []).filter((t: string) => t !== tag),
          updated_at: new Date().toISOString(),
        })
        .eq('id', vol.id);
      if (updateError) throw updateError;
    }

    return NextResponse.json({ updated: toUpdate.length });
  } catch (err) {
    return handleError(err, 'DELETE /api/volunteers/bulk-tag');
  }
}
