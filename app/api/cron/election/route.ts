import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runElectionCollection } from '@/app/lib/elections/electionCollector';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
export const maxDuration = 300;

function isAuthorizedCron(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim() ?? '';
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json(
      { ok: false, error: 'Coletor eleitoral não autorizado ou CRON_SECRET ausente.' },
      { status: process.env.CRON_SECRET ? 401 : 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const result = await runElectionCollection();
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha não identificada na coleta oficial do TSE.';
    console.error('[ELECTION_COLLECTOR]', 'cron-request-failed', JSON.stringify({ message }));
    return NextResponse.json(
      { ok: false, error: message },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
