import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminUser } from '@/app/api/_lib/adminServerAuth';
import { getElectionCollectorState, getElectionSettings, saveElectionSettings } from '@/app/lib/elections/electionStore';
import {
  BRAZILIAN_STATES,
  ELECTION_OFFICES,
  normalizeElectionSettings,
} from '@/app/lib/elections/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isValidSettings(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  const offices = settings.offices;
  const order = settings.officeOrder;
  const states = settings.selectedStates;
  if (
    typeof settings.active !== 'boolean' ||
    typeof settings.visible !== 'boolean' ||
    typeof settings.highlighted !== 'boolean' ||
    typeof settings.publicPageEnabled !== 'boolean' ||
    typeof settings.autoUpdate !== 'boolean' ||
    typeof settings.buttonText !== 'string' ||
    settings.buttonText.length > 48 ||
    (settings.round !== 1 && settings.round !== 2) ||
    !offices ||
    typeof offices !== 'object' ||
    Array.isArray(offices) ||
    !Array.isArray(order) ||
    order.length !== ELECTION_OFFICES.length ||
    new Set(order).size !== ELECTION_OFFICES.length ||
    !order.every((office) => ELECTION_OFFICES.includes(office as (typeof ELECTION_OFFICES)[number])) ||
    !Array.isArray(states) ||
    states.length > BRAZILIAN_STATES.length ||
    new Set(states).size !== states.length ||
    !states.every((state) => typeof state === 'string' && BRAZILIAN_STATES.some((item) => item.code === state))
  ) {
    return false;
  }
  return ELECTION_OFFICES.every((office) => typeof (offices as Record<string, unknown>)[office] === 'boolean');
}

export async function GET(request: NextRequest) {
  const user = await resolveAdminUser(request);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Somente o administrador principal pode gerenciar a apuração eleitoral.' }, { status: 403 });
  }

  try {
    const [settings, collector] = await Promise.all([getElectionSettings(), getElectionCollectorState()]);
    return NextResponse.json(
      { ok: true, settings, status: collector.status },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao carregar a configuração eleitoral.';
    console.error('[ELECTION_API]', 'admin-settings-read-failed', JSON.stringify({ message }));
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await resolveAdminUser(request);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Somente o administrador principal pode alterar a apuração eleitoral.' }, { status: 403 });
  }

  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false, error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { settings?: unknown } | null;
  if (!body || !isValidSettings(body.settings)) {
    return NextResponse.json({ ok: false, error: 'Configuração eleitoral inválida.' }, { status: 400 });
  }

  try {
    const settings = normalizeElectionSettings(body.settings);
    await saveElectionSettings(settings);
    console.info('[ELECTION_API]', 'admin-settings-saved', JSON.stringify({ userId: user.id, active: settings.active, autoUpdate: settings.autoUpdate }));
    return NextResponse.json({ ok: true, settings }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao salvar a configuração eleitoral.';
    console.error('[ELECTION_API]', 'admin-settings-save-failed', JSON.stringify({ userId: user.id, message }));
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
