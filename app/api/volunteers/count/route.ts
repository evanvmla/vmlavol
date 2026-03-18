import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';
import { applyFilterRules } from '@/lib/filter-volunteers';
import type { FilterRule } from '@/lib/filter-volunteers';
import type { CustomField } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rules: FilterRule[] = body.rules || [];

    const supabase = createSupabaseAdmin();

    const { data: customFields } = await supabase
      .from('custom_fields')
      .select('*');

    let query = supabase
      .from('volunteers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    query = applyFilterRules(query, rules, (customFields as CustomField[]) || []);

    const { count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ count: count ?? 0 });
  } catch (err) {
    return handleError(err, 'POST /api/volunteers/count');
  }
}
