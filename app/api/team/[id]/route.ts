import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Self-deletion guard: get the current user from session cookies
    const cookieStore = await cookies();
    const supabaseSession = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // Read-only in API route context
          },
        },
      }
    );
    const { data: { user } } = await supabaseSession.auth.getUser();

    if (user?.id === id) {
      return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 });
    }

    if (user?.email !== 'evan@votemiller.com') {
      return NextResponse.json({ error: 'Only the admin can remove team members' }, { status: 403 });
    }

    const supabase = createSupabaseAdmin();
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'team.delete');
  }
}
