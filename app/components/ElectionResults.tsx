'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Clock3, ExternalLink, RefreshCw, Search, Vote } from 'lucide-react';
import {
  BRAZILIAN_STATES,
  ELECTION_OFFICE_LABELS,
  type ElectionCandidate,
  type ElectionOffice,
  type ElectionSnapshot,
} from '@/app/lib/elections/types';

type PublicElectionSettings = {
  active: boolean;
  publicPageEnabled: boolean;
  round: 1 | 2;
  offices: ElectionOffice[];
  officeOrder: ElectionOffice[];
  selectedStates: string[];
};

type ResultsResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  snapshot: Omit<ElectionSnapshot, 'candidates'> | null;
  candidates?: ElectionCandidate[];
  page: number;
  perPage: number;
  totalCandidates: number;
  totalPages: number;
  isLive: boolean;
};

function formatNumber(value: string) {
  if (!/^\d+$/.test(value)) return value || '—';
  try {
    return new Intl.NumberFormat('pt-BR').format(BigInt(value));
  } catch (error) {
    console.error('[ELECTION_PAGE]', 'invalid-number-format', error);
    return value;
  }
}

function formatPercent(value: string) {
  if (!/^\d+(,\d+)?$/.test(value)) return '—';
  return `${value}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Não informado';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  }).format(timestamp);
}

export default function ElectionResults() {
  const [settings, setSettings] = useState<PublicElectionSettings | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [office, setOffice] = useState<ElectionOffice>('president');
  const [state, setState] = useState('BR');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTime, setRefreshTime] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/election/settings', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as {
          ok?: boolean;
          error?: string;
          active?: boolean;
          publicPageEnabled?: boolean;
          round?: 1 | 2;
          offices?: ElectionOffice[];
          officeOrder?: ElectionOffice[];
          selectedStates?: string[];
        };
        if (!response.ok || !data.ok) throw new Error(data.error || 'A configuração eleitoral não está disponível.');
        const availableOffices = Array.isArray(data.offices) ? data.offices : [];
        const nextSettings: PublicElectionSettings = {
          active: data.active === true,
          publicPageEnabled: data.publicPageEnabled === true,
          round: data.round === 2 ? 2 : 1,
          offices: availableOffices,
          officeOrder: Array.isArray(data.officeOrder) ? data.officeOrder : availableOffices,
          selectedStates: Array.isArray(data.selectedStates) ? data.selectedStates : [],
        };
        setSettings(nextSettings);
        const firstEnabled = nextSettings.officeOrder.find((item) => availableOffices.includes(item));
        if (firstEnabled) setOffice(firstEnabled);
        if (nextSettings.selectedStates.length) setState(nextSettings.selectedStates[0]);
        setSettingsError('');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSettingsError(error instanceof Error ? error.message : 'Falha ao carregar a apuração eleitoral.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const selectedState = office === 'president' ? 'BR' : state;
  const fetchResults = useCallback(async (signal: AbortSignal) => {
    if (!settings || !settings.active || !settings.publicPageEnabled || !settings.offices.includes(office)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({
      office,
      page: String(page),
      perPage: '50',
    });
    if (office !== 'president' && selectedState) params.set('state', selectedState);
    if (debouncedQuery) params.set('q', debouncedQuery);
    try {
      const response = await fetch(`/api/election/results?${params.toString()}`, {
        signal,
        cache: 'no-store',
      });
      const data = await response.json() as ResultsResponse;
      if (!response.ok || !data.ok) throw new Error(data.error || 'Não foi possível consultar os resultados oficiais.');
      setResult(data);
      setRefreshTime(new Date());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao consultar os resultados.',
        snapshot: null,
        page: 1,
        perPage: 50,
        totalCandidates: 0,
        totalPages: 0,
        isLive: false,
      });
      console.error('[ELECTION_PAGE]', 'results-load-failed', error);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, office, page, selectedState, settings]);

  useEffect(() => {
    if (!settings) return;
    const controller = new AbortController();
    const initialLoad = window.setTimeout(() => {
      void fetchResults(controller.signal);
    }, 0);
    const interval = window.setInterval(() => setRefreshKey((current) => current + 1), 30_000);
    return () => {
      window.clearTimeout(initialLoad);
      controller.abort();
      window.clearInterval(interval);
    };
  }, [fetchResults, refreshKey, settings]);

  const availableOffices = useMemo(
    () => (settings?.officeOrder ?? []).filter((item) => settings?.offices.includes(item)),
    [settings]
  );
  const availableStates = useMemo(
    () => BRAZILIAN_STATES.filter((item) => settings?.selectedStates.includes(item.code)),
    [settings]
  );
  const snapshot = result?.snapshot;
  const candidates = result?.candidates ?? [];
  const totalPages = result?.totalPages ?? 0;

  const changeOffice = (value: string) => {
    setOffice(value as ElectionOffice);
    setPage(1);
  };

  const changeState = (value: string) => {
    setState(value);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <section className="bg-[#101010] text-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">RBN • Eleições 2026</p>
          <h1 className="mt-3 flex items-center gap-3 text-3xl font-black sm:text-4xl">
            <Vote className="h-9 w-9 text-red-400" aria-hidden="true" />
            Apuração Eleitoral
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-gray-300 sm:text-base">
            Acompanhe os resultados oficiais publicados pelo Tribunal Superior Eleitoral. Os dados são coletados e validados pelo RBN; a atualização depende da divulgação oficial do TSE.
          </p>
          <a
            href="https://resultados.tse.jus.br"
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-red-200 underline underline-offset-4 hover:text-white"
          >
            Consultar portal oficial do TSE
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {settingsError && (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-bold">Apuração temporariamente indisponível</p>
                <p className="mt-1">{settingsError}</p>
              </div>
            </div>
          </div>
        )}

        {settings && (!settings.active || !settings.publicPageEnabled) && (
          <div role="status" className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">
            A apuração eleitoral ainda não foi habilitada para publicação pelo portal.
          </div>
        )}

        {settings && settings.active && settings.publicPageEnabled && (
          <>
            <section aria-label="Filtros de resultados" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
                <label className="space-y-2 text-sm font-bold text-gray-800">
                  Cargo
                  <select
                    value={office}
                    onChange={(event) => changeOffice(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-medium outline-none focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                  >
                    {availableOffices.map((item) => (
                      <option key={item} value={item}>{ELECTION_OFFICE_LABELS[item]}</option>
                    ))}
                  </select>
                </label>
                {office !== 'president' && (
                  <label className="space-y-2 text-sm font-bold text-gray-800">
                    Estado
                    <select
                      value={state}
                      onChange={(event) => changeState(event.target.value)}
                      disabled={!availableStates.length}
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-medium outline-none focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10 disabled:bg-gray-100"
                    >
                      {availableStates.map((item) => (
                        <option key={item.code} value={item.code}>{item.name} ({item.code})</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="space-y-2 text-sm font-bold text-gray-800">
                  Buscar candidato, número ou partido
                  <span className="relative block">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value.slice(0, 80));
                        setPage(1);
                      }}
                      placeholder="Digite para filtrar"
                      className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-4 font-normal outline-none focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                    />
                  </span>
                </label>
              </div>
            </section>

            {snapshot && (
              <section aria-label="Resumo da apuração" className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      {snapshot.electionYear} • {snapshot.round}º turno • {snapshot.stateLabel}
                    </p>
                    <h2 className="mt-2 text-xl font-black text-gray-950">{snapshot.officeLabel}</h2>
                  </div>
                  <div className={`rounded-full px-3 py-1.5 text-xs font-bold ${result?.isLive ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
                    {result?.isLive ? 'Atualização recente do TSE' : 'Dados sem confirmação de atualização recente'}
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-500">Seções apuradas</p>
                    <p className="mt-2 text-lg font-black text-gray-900">{formatNumber(snapshot.totalization.sectionsCounted)}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-500">Total de seções</p>
                    <p className="mt-2 text-lg font-black text-gray-900">{formatNumber(snapshot.totalization.totalSections)}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-500">Apuração</p>
                    <p className="mt-2 text-lg font-black text-gray-900">{formatPercent(snapshot.totalization.percentCounted)}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-500">Votos válidos</p>
                    <p className="mt-2 text-lg font-black text-gray-900">{formatNumber(snapshot.totalization.validVotes)}</p>
                  </div>
                </div>
              </section>
            )}

            <section aria-labelledby="election-candidate-results" className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
                <div>
                  <h2 id="election-candidate-results" className="font-bold text-gray-950">Resultados por candidato</h2>
                  <p className="mt-1 text-xs text-gray-500">{result?.totalCandidates ?? 0} candidatos neste resultado</p>
                </div>
                <p className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Verificado: {formatDateTime(result?.snapshot?.fetchedAt)}
                </p>
              </div>

              {result?.message && (
                <div role="status" className="border-b border-gray-100 bg-gray-50 px-5 py-3 text-sm text-gray-700">
                  {result.message}
                </div>
              )}

              {result?.error && (
                <div role="alert" className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {result.error}
                </div>
              )}

              {loading && !result && (
                <div role="status" className="p-10 text-center text-sm text-gray-500">Carregando dados oficiais...</div>
              )}

              {!loading && !result?.error && !snapshot && (
                <div className="p-10 text-center text-sm text-gray-600">
                  Nenhum resultado oficial validado foi recebido para esta seleção. Os votos não são estimados nem preenchidos com dados fictícios.
                </div>
              )}

              {snapshot && candidates.length > 0 && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] border-collapse text-left">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th scope="col" className="px-5 py-3 font-bold">Posição</th>
                          <th scope="col" className="px-5 py-3 font-bold">Candidato</th>
                          <th scope="col" className="px-5 py-3 font-bold">Partido</th>
                          <th scope="col" className="px-5 py-3 text-right font-bold">Votos</th>
                          <th scope="col" className="px-5 py-3 text-right font-bold">Percentual</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {candidates.map((candidate) => (
                          <tr key={candidate.id} className="hover:bg-gray-50">
                            <td className="px-5 py-4 text-sm font-bold text-gray-500">{candidate.position}º</td>
                            <td className="px-5 py-4">
                              <p className="font-bold text-gray-950">{candidate.name}</p>
                              <p className="mt-1 text-xs text-gray-500">Número {candidate.number}</p>
                            </td>
                            <td className="px-5 py-4 text-sm font-semibold text-gray-700">{candidate.party || '—'}</td>
                            <td className="px-5 py-4 text-right text-sm font-bold tabular-nums text-gray-900">{formatNumber(candidate.votes)}</td>
                            <td className="px-5 py-4 text-right text-sm font-semibold tabular-nums text-gray-700">{formatPercent(candidate.percent)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-4">
                    <p className="text-sm text-gray-600">Página {page} de {totalPages || 1}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={page <= 1 || loading}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        disabled={page >= totalPages || loading}
                        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                </>
              )}

              {snapshot && candidates.length === 0 && !loading && (
                <div className="p-10 text-center text-sm text-gray-600">Nenhum candidato corresponde à busca.</div>
              )}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
              <p>Fonte dos dados: Tribunal Superior Eleitoral. O RBN não altera nem estima resultados.</p>
              <button
                type="button"
                onClick={() => setRefreshKey((current) => current + 1)}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Atualizar resultados{refreshTime ? ` • ${refreshTime.toLocaleTimeString('pt-BR')}` : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
