import { NextResponse } from 'next/server';
import { getElectionCollectorState, getElectionSettings } from '@/app/lib/elections/electionStore';
import { ELECTION_OFFICES, normalizeElectionSettings } from '@/app/lib/elections/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [savedSettings, collector] = await Promise.all([getElectionSettings(), getElectionCollectorState()]);
    const settings = normalizeElectionSettings(savedSettings);
    const enabledOffices = settings.officeOrder.filter((office) => settings.offices[office]);
    return NextResponse.json(
      {
        ok: true,
        active: settings.active,
        visible: settings.visible,
        highlighted: settings.highlighted,
        publicPageEnabled: settings.publicPageEnabled,
        buttonText: settings.buttonText,
        round: settings.round,
        offices: enabledOffices.filter((office) => ELECTION_OFFICES.includes(office)),
        officeOrder: settings.officeOrder,
        selectedStates: settings.selectedStates,
        availableStates: collector.status.availableStates,
        status: collector.status,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar a configuração da apuração.';
    console.error('[ELECTION_API]', 'public-settings-read-failed', JSON.stringify({ message }));
    return NextResponse.json(
      { ok: false, error: 'A apuração eleitoral está temporariamente indisponível.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
