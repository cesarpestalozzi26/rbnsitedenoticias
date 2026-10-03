import { NextRequest, NextResponse } from 'next/server';
import { getElectionCollectorState, getElectionSettings, getElectionSnapshot } from '@/app/lib/elections/electionStore';
import { ELECTION_OFFICES, normalizeElectionSettings, type ElectionOffice, type ElectionSnapshot } from '@/app/lib/elections/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parsePositiveInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function isDataFresh(snapshot: ElectionSnapshot, checkedAt: string | null) {
  const sourceTime = Date.parse(snapshot.sourceUpdatedAt);
  const collectorTime = checkedAt ? Date.parse(checkedAt) : Number.NaN;
  const now = Date.now();
  const configured = Number(process.env.ELECTION_DATA_STALE_AFTER_SECONDS);
  const staleAfterMs = (Number.isInteger(configured) ? Math.max(60, Math.min(configured, 3600)) : 300) * 1000;
  return Number.isFinite(sourceTime) &&
    Number.isFinite(collectorTime) &&
    now - sourceTime >= -60_000 &&
    now - sourceTime <= staleAfterMs &&
    now - collectorTime >= -60_000 &&
    now - collectorTime <= staleAfterMs;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const officeValue = params.get('office') ?? 'president';
  if (!ELECTION_OFFICES.includes(officeValue as ElectionOffice)) {
    return NextResponse.json({ ok: false, error: 'Cargo eleitoral inválido.' }, { status: 400 });
  }
  const office = officeValue as ElectionOffice;
  const page = parsePositiveInteger(params.get('page'), 1, 100_000);
  const perPage = parsePositiveInteger(params.get('perPage'), 50, 100);
  if (page === null || perPage === null) {
    return NextResponse.json({ ok: false, error: 'Página ou quantidade de resultados inválida.' }, { status: 400 });
  }
  const query = (params.get('q') ?? '').trim().slice(0, 80);
  const stateValue = (params.get('state') ?? '').trim().toUpperCase();
  if (stateValue && !/^(BR|AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(stateValue)) {
    return NextResponse.json({ ok: false, error: 'UF inválida.' }, { status: 400 });
  }

  try {
    const [savedSettings, collector] = await Promise.all([getElectionSettings(), getElectionCollectorState()]);
    const settings = normalizeElectionSettings(savedSettings);
    if (!settings.active || !settings.publicPageEnabled) {
      return NextResponse.json({ ok: false, error: 'A página de apuração eleitoral está desativada.' }, { status: 404 });
    }
    if (!settings.offices[office]) {
      return NextResponse.json({ ok: false, error: 'Este cargo não está disponível na apuração.' }, { status: 404 });
    }

    const state = office === 'president'
      ? 'BR'
      : stateValue || settings.selectedStates[0] || '';
    if (!state) {
      return NextResponse.json({ ok: false, error: 'Nenhuma UF foi habilitada para exibição.' }, { status: 409 });
    }
    if (office !== 'president' && !settings.selectedStates.includes(state)) {
      return NextResponse.json({ ok: false, error: 'Esta UF não está habilitada para exibição.' }, { status: 404 });
    }

    const snapshot = await getElectionSnapshot(settings.round, state, office);
    if (!snapshot) {
      console.info('[ELECTION_API]', 'snapshot-not-yet-available', JSON.stringify({ office, state, round: settings.round }));
      return NextResponse.json(
        {
          ok: true,
          snapshot: null,
          page: 1,
          perPage,
          totalCandidates: 0,
          totalPages: 0,
          isLive: false,
          status: collector.status,
          message: 'Os dados oficiais deste cargo e local ainda não foram recebidos e validados pelo RBN.',
        },
        { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } }
      );
    }

    const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    const candidates = normalizedQuery
      ? snapshot.candidates.filter((candidate) =>
          [candidate.name, candidate.number, candidate.party]
            .some((value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(normalizedQuery))
        )
      : snapshot.candidates;
    const start = (page - 1) * perPage;
    const items = candidates.slice(start, start + perPage);

    return NextResponse.json(
      {
        ok: true,
        snapshot: {
          ...snapshot,
          candidates: undefined,
        },
        candidates: items,
        page,
        perPage,
        totalCandidates: candidates.length,
        totalPages: Math.ceil(candidates.length / perPage),
        isLive: collector.status.sourceStatus === 'connected' && isDataFresh(snapshot, collector.status.lastCheckedAt),
        status: collector.status,
        message: collector.status.sourceStatus === 'connected' && isDataFresh(snapshot, collector.status.lastCheckedAt)
          ? 'Dados oficiais atualizados recentemente pelo Tribunal Superior Eleitoral.'
          : `Os dados oficiais estão temporariamente sem atualização recente. A última atualização recebida foi às ${snapshot.sourceUpdatedAt ? new Date(snapshot.sourceUpdatedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'indisponível'}.`,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar os resultados eleitorais.';
    console.error('[ELECTION_API]', 'public-results-read-failed', JSON.stringify({ office, state: stateValue || null, message }));
    return NextResponse.json(
      { ok: false, error: 'Os dados oficiais estão temporariamente indisponíveis.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
