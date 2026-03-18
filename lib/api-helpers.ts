import { NextResponse } from 'next/server';

export function handleError(error: unknown, context: string): NextResponse {
  console.error(`[${context}]`, error);
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function parseSearch(searchParams: URLSearchParams) {
  return searchParams.get('search')?.trim() || '';
}

export function parseOrderBy(searchParams: URLSearchParams, allowed: string[], defaultCol: string) {
  const col = searchParams.get('orderBy') || defaultCol;
  const dir = searchParams.get('order') === 'asc' ? true : false;
  if (!allowed.includes(col)) return { column: defaultCol, ascending: false };
  return { column: col, ascending: dir };
}

export function verifyCronSecret(request: Request): boolean {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}
