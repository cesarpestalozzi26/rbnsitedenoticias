'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { AlertCircle, ExternalLink, Info, MapPin, RefreshCw, Search, Vote } from 'lucide-react';
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

function percentValue(value: string) {
  if (!/^\d+(,\d+)?$/.test(value)) return 0;
  return Math.min(100, Math.max(0, Number(value.replace(',', '.'))));
}

function candidateInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toLocaleUpperCase('pt-BR');
}

function CandidateAvatar({ candidate }: { candidate: ElectionCandidate }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="relative flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full border-[5px] border-gray-100 bg-white p-1 text-xl font-extrabold text-gray-500 ring-1 ring-gray-100">
      <span className="absolute left-1/2 top-[-7px] z-10 h-2 w-2 -translate-x-1/2 rounded-full bg-[#e4b000]" aria-hidden="true" />
      {candidate.photoUrl && !imageFailed ? (
        <Image
          src={candidate.photoUrl}
          alt={`Foto oficial de ${candidate.name}`}
          width={80}
          height={80}
          unoptimized
          onError={() => setImageFailed(true)}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span aria-label={`Iniciais de ${candidate.name}`}>{candidateInitials(candidate.name)}</span>
      )}
    </div>
  );
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
  const progress = percentValue(snapshot?.totalization.percentCounted ?? '');

  const changeOffice = (value: string) => {
    setOffice(value as ElectionOffice);
    setPage(1);
  };

  const changeState = (value: string) => {
    setState(value);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-[#f3f3f3] pb-12">
      <section className="border-t-[5px] border-[#efbd00] bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-5">
            <div className="flex shrink-0 flex-col leading-none" aria-label="Eleições 2026">
              <span className="text-[10px] font-black uppercase tracking-tight text-gray-700">Eleições</span>
              <span className="text-2xl font-black tracking-[-0.06em] text-[#e0ad00]">2026</span>
              <span className="mt-0.5 text-[6px] font-bold uppercase tracking-[0.1em] text-gray-500">RBN • informação</span>
            </div>
            <div className="h-10 w-px bg-gray-200" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Apuração eleitoral</p>
              <h1 className="truncate text-base font-bold text-gray-900 sm:text-xl">Eleição Geral Ordinária 2026</h1>
            </div>
          </div>
          <nav aria-label="Navegação da apuração" className="flex items-center gap-5 overflow-x-auto text-sm">
            <a href="#resultados" className="shrink-0 border-b-[3px] border-[#efbd00] py-3 font-extrabold text-gray-900">Resultados</a>
            <a href="#resumo-geral" className="shrink-0 py-3 font-medium text-gray-600 transition hover:text-gray-950">Resumo geral</a>
            <a
              href="https://resultados.tse.jus.br"
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 py-3 font-medium text-gray-600 transition hover:text-gray-950"
            >
              TSE oficial
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </nav>
        </div>

        <div className="border-t border-gray-100 bg-[#fafafa]">
          <div className="mx-auto grid max-w-[1480px] grid-cols-2 items-end gap-x-5 gap-y-3 px-4 py-3 sm:px-6 lg:grid-cols-[185px_120px_minmax(220px,1fr)_minmax(220px,1.2fr)_auto] lg:gap-x-8 lg:px-8">
            {office === 'president' ? (
              <div className="flex min-w-0 items-center gap-3 pb-1">
                <MapPin className="h-6 w-6 shrink-0 fill-[#efbd00] text-[#efbd00]" aria-hidden="true" />
                <span className="text-lg font-bold text-gray-800">Brasil</span>
              </div>
            ) : (
              <label className="min-w-0 space-y-1">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-gray-500">Localização</span>
                <span className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 shrink-0 text-[#e0ad00]" aria-hidden="true" />
                  <select
                    value={state}
                    onChange={(event) => changeState(event.target.value)}
                    disabled={!availableStates.length}
                    className="w-full appearance-none bg-transparent py-1 text-lg font-bold text-gray-800 outline-none disabled:opacity-50"
                  >
                    {availableStates.map((item) => (
                      <option key={item.code} value={item.code}>{item.name}</option>
                    ))}
                  </select>
                </span>
              </label>
            )}
            <div className="min-w-0">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Turno</span>
              <span className="inline-flex rounded-lg bg-[#efbd00] px-4 py-1.5 text-base font-extrabold text-gray-900">
                {settings?.round ?? 1}º
              </span>
            </div>
            <label className="col-span-2 min-w-0 space-y-1 lg:col-span-1">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-gray-500">Cargo</span>
              <select
                value={office}
                onChange={(event) => changeOffice(event.target.value)}
                disabled={!availableOffices.length}
                className="w-full appearance-none border-b border-gray-300 bg-transparent py-2 text-base font-bold text-gray-800 outline-none focus:border-[#d1a700]"
              >
                {(availableOffices.length ? availableOffices : [office]).map((item) => (
                  <option key={item} value={item}>{ELECTION_OFFICE_LABELS[item]}</option>
                ))}
              </select>
            </label>
            <label className="col-span-2 min-w-0 space-y-1 lg:col-span-1">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-gray-500">Buscar candidato</span>
              <span className="relative block">
                <Search className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value.slice(0, 80));
                    setPage(1);
                  }}
                  placeholder="Nome, número ou partido"
                  className="w-full border-b border-gray-300 bg-transparent py-2 pl-6 pr-2 text-sm outline-none placeholder:text-gray-400 focus:border-[#d1a700]"
                />
              </span>
            </label>
            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
              disabled={loading}
              className="col-span-2 mb-0.5 inline-flex items-center justify-self-end gap-2 rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-300 disabled:opacity-50 lg:col-span-1"
            >
              <RefreshCw className={`h-4 w-4 text-[#d2a900] ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-8">
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
          <div role="status" className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm">
            A apuração eleitoral ainda não foi habilitada para publicação pelo portal.
          </div>
        )}

        {settings && settings.active && settings.publicPageEnabled && (
          <>
            <div id="resultados" className="grid scroll-mt-8 items-start gap-5 lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.55fr)]">
              <aside id="resumo-geral" className="space-y-4 scroll-mt-8">
                {snapshot ? (
                  <>
                    <section aria-label="Dados gerais da apuração" className="rounded-[22px] bg-white p-5 shadow-[0_3px_12px_rgba(0,0,0,0.07)] sm:p-6">
                      <h2 className="text-[22px] font-extrabold text-gray-800">Dados Gerais</h2>
                      <p className="mt-3 text-xs font-medium leading-5 text-gray-500">
                        Última atualização {formatDateTime(snapshot.sourceUpdatedAt)} (Horário local)
                      </p>
                      <dl className="mt-5 space-y-3">
                        <div className="flex items-baseline justify-between gap-4 text-[15px]">
                          <dt className="text-gray-700">Número de vagas</dt>
                          <dd className="font-extrabold tabular-nums text-gray-800">{formatNumber(snapshot.seats)}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-4 text-[15px]">
                          <dt className="text-gray-700">Total de seções</dt>
                          <dd className="font-extrabold tabular-nums text-gray-800">{formatNumber(snapshot.totalization.totalSections)}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-4 text-[15px]">
                          <dt className="text-gray-700">Seções totalizadas</dt>
                          <dd className="font-extrabold tabular-nums text-gray-800">{formatNumber(snapshot.totalization.sectionsCounted)}</dd>
                        </div>
                      </dl>
                      <div
                        className="mt-2 h-7 overflow-hidden rounded-md bg-[#e7e7e7]"
                        role="progressbar"
                        aria-label="Percentual de seções totalizadas"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress}
                      >
                        <div className="flex h-full items-center justify-center bg-[#e7e7e7] text-sm font-extrabold text-gray-900" style={{ width: `${Math.max(progress, 15)}%` }}>
                          {formatPercent(snapshot.totalization.percentCounted)}
                        </div>
                      </div>
                    </section>

                    <section aria-label="Votação oficial" className="rounded-[22px] bg-white p-4 shadow-[0_3px_12px_rgba(0,0,0,0.07)] sm:p-5">
                      <h2 className="text-lg font-extrabold text-gray-500">Votação</h2>
                      <div className="mt-3 h-4 overflow-hidden rounded-full bg-[#eceeef]">
                        <div className="h-full rounded-full bg-[#9cb833] transition-[width]" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatNumber(snapshot.totalization.sectionsCounted)} seções totalizadas
                      </p>
                      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-gray-700">Votos válidos</span>
                        <span className="font-extrabold tabular-nums text-gray-800">{formatNumber(snapshot.totalization.validVotes)}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs leading-5 text-gray-500">
                        <Info className="h-4 w-4 shrink-0 text-[#d7aa00]" aria-hidden="true" />
                        Exibimos somente totais presentes no arquivo oficial recebido do TSE.
                      </div>
                    </section>
                  </>
                ) : (
                  <section className="rounded-[22px] bg-white p-5 shadow-[0_3px_12px_rgba(0,0,0,0.07)]">
                    <h2 className="text-xl font-extrabold text-gray-800">Dados Gerais</h2>
                    <p className="mt-2 text-sm leading-6 text-gray-600">O resumo aparecerá quando houver um arquivo oficial validado para esta eleição, cargo e localidade.</p>
                  </section>
                )}
              </aside>

              <section aria-labelledby="election-candidate-results" className="min-w-0">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="inline-flex rounded-b-lg bg-[#758b2c] px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-white">
                      {ELECTION_OFFICE_LABELS[office]}
                    </span>
                    <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#d3a800]">Nominal</p>
                    <h2 id="election-candidate-results" className="sr-only">Resultados por candidato</h2>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className={`rounded-full px-3 py-1.5 font-bold ${result?.isLive ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
                      {result?.isLive ? 'Atualização recente' : 'Sem atualização recente'}
                    </span>
                    <span className="hidden sm:inline">{formatDateTime(result?.snapshot?.fetchedAt)}</span>
                  </div>
                </div>

              {result?.message && (
                <div role="status" className="mb-4 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm text-gray-700 shadow-sm">
                  {result.message}
                </div>
              )}

              {result?.error && (
                <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {result.error}
                </div>
              )}

              {loading && !result && (
                <div role="status" className="rounded-[22px] bg-white p-10 text-center text-sm text-gray-500 shadow-sm">Carregando dados oficiais...</div>
              )}

              {!loading && !result?.error && !snapshot && (
                <div className="rounded-[22px] bg-white p-8 text-center shadow-sm sm:p-12">
                  <Vote className="mx-auto h-10 w-10 text-[#d6aa00]" aria-hidden="true" />
                  <p className="mt-4 font-bold text-gray-800">Aguardando resultados oficiais</p>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gray-600">
                    Ainda não recebemos resultados validados do TSE para {ELECTION_OFFICE_LABELS[office]} em {office === 'president' ? 'Brasil' : (availableStates.find((item) => item.code === state)?.name ?? state)}. Nenhum voto é estimado ou preenchido com dados fictícios.
                  </p>
                </div>
              )}

              {snapshot && candidates.length > 0 && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {candidates.map((candidate) => (
                      <article key={candidate.id} className="min-h-[200px] rounded-[22px] bg-white p-5 shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:p-6">
                        <div className="flex items-start justify-between gap-3">
                          <CandidateAvatar key={candidate.photoUrl ?? candidate.id} candidate={candidate} />
                          <div className="shrink-0 text-right">
                            <p className="text-2xl font-black leading-none tabular-nums text-[#e4b000] sm:text-[30px]">
                              {formatPercent(candidate.percent)}
                            </p>
                            <p className="mt-2 text-sm font-medium text-gray-600">
                              {formatNumber(candidate.votes)} votos
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm font-bold tracking-wide text-gray-500">
                          {candidate.party || 'Candidato'}{candidate.number ? ` – ${candidate.number}` : ''}
                        </p>
                        <h3 className="mt-3 line-clamp-2 text-xl font-extrabold uppercase leading-tight text-gray-800 sm:text-2xl">
                          {candidate.name}
                        </h3>
                        {candidate.officialStatus && (
                          <p className="mt-2 text-xs font-semibold text-gray-500">{candidate.officialStatus}</p>
                        )}
                      </article>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-5 py-4 shadow-sm">
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
                <div className="rounded-[22px] bg-white p-10 text-center text-sm text-gray-600 shadow-sm">Nenhum candidato corresponde à busca.</div>
              )}
              </section>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-300 pt-4 text-xs text-gray-500">
              <p>Fonte: Tribunal Superior Eleitoral. O RBN não altera nem estima resultados.</p>
              <p>Atualizado nesta tela: {refreshTime ? refreshTime.toLocaleTimeString('pt-BR') : 'aguardando consulta'}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
