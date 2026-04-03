import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError, parsePagination, parseSearch } from '@/lib/api-helpers';
import { validateRequired, isValidEmail } from '@/lib/validation';
import { applyFilterRules, type FilterRule } from '@/lib/filter-volunteers';

const VALID_SORT_COLS = ['first_name', 'last_name', 'email', 'phone', 'zip_code', 'status', 'created_at'];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { limit, offset } = parsePagination(searchParams);
    const search = parseSearch(searchParams);
    const status = searchParams.get('status');
    const tag = searchParams.get('tag');
    const rawSortCol = searchParams.get('sort_col') || 'created_at';
    const ascending = searchParams.get('sort_dir') === 'asc';

    const supabase = createSupabaseAdmin();
    let query = supabase
      .from('volunteers')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }
    if (status) query = query.eq('status', status);
    if (tag) query = query.contains('tags', [tag]);

    const rulesParam = searchParams.get('rules');
    if (rulesParam) {
      try {
        const rules: FilterRule[] = JSON.parse(rulesParam);
        const supabase2 = createSupabaseAdmin();
        const { data: cfData } = await supabase2.from('custom_fields').select('*');
        query = applyFilterRules(query, rules, cfData || []);
      } catch {
        // malformed rules param — ignore
      }
    }

    // Sorting
    let orderCol: string;
    if (rawSortCol.startsWith('custom:')) {
      const cfKey = rawSortCol.slice(7).replace(/[^a-z0-9_]/g, '');
      orderCol = cfKey ? `custom_data->>${cfKey}` : 'created_at';
    } else {
      orderCol = VALID_SORT_COLS.includes(rawSortCol) ? rawSortCol : 'created_at';
    }

    const { data, error, count } = await query
      .order(orderCol, { ascending })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return NextResponse.json({ data, total: count });
  } catch (err) {
    return handleError(err, 'GET /api/volunteers');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const missing = validateRequired(body, ['first_name', 'last_name']);
    if (missing) {
      return NextResponse.json({ error: missing }, { status: 400 });
    }
    if (!body.email?.trim() && !body.phone?.trim()) {
      return NextResponse.json({ error: 'Email or phone is required' }, { status: 400 });
    }
    if (body.email?.trim() && !isValidEmail(body.email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('volunteers')
      .insert({
        email: body.email?.toLowerCase().trim() || null,
        first_name: body.first_name.trim(),
        last_name: body.last_name.trim(),
        phone: body.phone || null,
        zip_code: body.zip_code || null,
        source_form_id: body.source_form_id || null,
        custom_data: body.custom_data || {},
        tags: body.tags || [],
        notes: body.notes || null,
        status: body.status || 'active',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A volunteer with this email already exists' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleError(err, 'POST /api/volunteers');
  }
}
