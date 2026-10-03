'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, RefreshCw, Save, TriangleAlert, Vote } from 'lucide-react';
import AdminSidebar from '@/app/components/AdminSidebar';
import {
  BRAZILIAN_STATES,
  DEFAULT_ELECTION_COLLECTOR_STATUS,
  DEFAULT_ELECTION_SETTINGS,
  ELECTION_OFFICE_LABELS,
  type ElectionCollectorStatus,
  type ElectionOffice,
  type ElectionSettings,
  normalizeElectionSettings,
} from '@/app/lib/elections/types';

function formatDateTime(value: string | null) {
  if (!value) return 'Ainda não recebido';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Horário não informado pelo TSE';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  }).format(timestamp);
}

function statusLabel(status: ElectionCollectorStatus['sourceStatus']) {
  if (status === 'connected') return 'Conectado';
  if (status === 'stale') return 'Sem atualização recente';
  if (status === 'error') return 'Com erro';
  return 'Aguardando primeira coleta';
}

export default function ElectionAdminPage() {
  const [settings, setSettings] = useState<ElectionSettings>(structuredClone(DEFAULT_ELECTION_SETTINGS));
  const [status, setStatus] = useState<ElectionCollectorStatus>(DEFAULT_ELECTION_COLLECTOR_STATUS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async (includeSettings: boolean) => {
    const response = await fetch('/api/admin/election', { cache: 'no-store' });
    const data = await response.json() as {
      ok?: boolean;
      error?: string;
      settings?: unknown;
      status?: ElectionCollectorStatus;
    };
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Não foi possível carregar a apuração eleitoral.');
    }
    if (includeSettings && data.settings) {
      setSettings(normalizeElectionSettings(data.settings));
    }
    if (data.status) setStatus(data.status);
    if (includeSettings) setError('');
  }, []);

  useEffect(() => {
    let active = true;
    const initialLoad = window.setTimeout(() => {
      void load(true).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar a apuração.');
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 0);
    const interval = window.setInterval(() => {
      void load(false).catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Falha ao atualizar o status da coleta.');
        console.error('[ELECTION_ADMIN]', 'status-refresh-failed', loadError);
      });
    }, 30_000);
    return () => {
      active = false;
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [load]);

  const update = <K extends keyof ElectionSettings>(key: K, value: ElectionSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage('');
  };

  const toggleOffice = (office: ElectionOffice) => {
    setSettings((current) => ({
      ...current,
      offices: { ...current.offices, [office]: !current.offices[office] },
    }));
    setMessage('');
  };

  const toggleState = (state: string) => {
    setSettings((current) => ({
      ...current,
      selectedStates: current.selectedStates.includes(state)
        ? current.selectedStates.filter((item) => item !== state)
        : [...current.selectedStates, state],
    }));
    setMessage('');
  };

  const moveOffice = (office: ElectionOffice, direction: -1 | 1) => {
    const index = settings.officeOrder.indexOf(office);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= settings.officeOrder.length) return;
    const officeOrder = [...settings.officeOrder];
    [officeOrder[index], officeOrder[nextIndex]] = [officeOrder[nextIndex], officeOrder[index]];
    update('officeOrder', officeOrder);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/election', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
        cache: 'no-store',
      });
      const data = await response.json() as { ok?: boolean; error?: string; settings?: ElectionSettings };
      if (!response.ok || !data.ok || !data.settings) {
        throw new Error(data.error || 'Não foi possível salvar as configurações eleitorais.');
      }
      setSettings(normalizeElectionSettings(data.settings));
      setMessage('Configuração eleitoral salva.');
      await load(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar a apuração eleitoral.');
    } finally {
      setSaving(false);
    }
  };

  const checkboxClass = 'h-4 w-4 rounded border-gray-300 accent-[#991B1B] focus:ring-[#991B1B]';

  return (
    <div className="flex min-h-screen bg-gray-100">
      <AdminSidebar />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#991B1B]">Administração</p>
              <h1 className="mt-2 flex items-center gap-3 text-2xl font-black text-gray-950 sm:text-3xl">
                <Vote className="h-8 w-8 text-[#991B1B]" aria-hidden="true" />
                Apuração Eleitoral 2026
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                Controle a publicação da central e a coleta automatizada. Os votos e resultados são somente leitura e vêm dos arquivos oficiais assinados do TSE.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={loading || saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#991B1B] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#7f1d1d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </header>

          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
              {message}
            </div>
          )}

          <section aria-labelledby="election-source-status" className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="election-source-status" className="text-lg font-bold text-gray-900">Fonte oficial e atualização</h2>
                <a
                  href="https://resultados.tse.jus.br"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-[#991B1B] underline underline-offset-2"
                >
                  Tribunal Superior Eleitoral (TSE)
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
                  status.sourceStatus === 'connected'
                    ? 'bg-green-100 text-green-800'
                    : status.sourceStatus === 'stale' || status.sourceStatus === 'error'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-gray-100 text-gray-700'
                }`}
                role="status"
                aria-label={`Status da fonte TSE: ${statusLabel(status.sourceStatus)}`}
              >
                {status.sourceStatus === 'connected'
                  ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  : <TriangleAlert className="h-4 w-4" aria-hidden="true" />}
                {statusLabel(status.sourceStatus)}
              </div>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-gray-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Último dado oficial</dt>
                <dd className="mt-2 text-sm font-bold text-gray-900">{formatDateTime(status.lastUpdatedAt)}</dd>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Última verificação</dt>
                <dd className="mt-2 text-sm font-bold text-gray-900">{formatDateTime(status.lastCheckedAt)}</dd>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Próxima verificação</dt>
                <dd className="mt-2 text-sm font-bold text-gray-900">{formatDateTime(status.nextCheckAt)}</dd>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Turno no TSE</dt>
                <dd className="mt-2 text-sm font-bold text-gray-900">
                  {status.secondRoundAvailable ? '1º e 2º turno configurados' : '1º turno'}
                </dd>
              </div>
            </dl>
            {status.lastError && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Último aviso do coletor: {status.lastError}
              </p>
            )}
          </section>

          <section aria-labelledby="election-general-settings" className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
            <h2 id="election-general-settings" className="text-lg font-bold text-gray-900">Publicação e coleta</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {([
                ['active', 'Apuração ativa', 'Habilita o módulo e permite a coleta conforme as opções abaixo.'],
                ['publicPageEnabled', 'Página pública ativa', 'Permite acessar a rota /apuracao.'],
                ['visible', 'Mostrar botão no portal', 'Exibe a entrada de navegação para os leitores.'],
                ['highlighted', 'Destacar o botão', 'Mostra o botão com maior destaque visual no portal.'],
                ['autoUpdate', 'Atualizações automáticas', 'Autoriza o cron a coletar arquivos oficiais assinados do TSE.'],
              ] as const).map(([key, label, description]) => (
                <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 hover:border-gray-300">
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(event) => update(key, event.target.checked)}
                    className={`${checkboxClass} mt-0.5`}
                  />
                  <span>
                    <span className="block text-sm font-bold text-gray-900">{label}</span>
                    <span className="mt-1 block text-xs leading-5 text-gray-500">{description}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-gray-700">
                Texto do botão
                <input
                  type="text"
                  value={settings.buttonText}
                  maxLength={48}
                  onChange={(event) => update('buttonText', event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 font-normal text-gray-900 outline-none focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-gray-700">
                Turno
                <select
                  value={settings.round}
                  onChange={(event) => update('round', Number(event.target.value) as 1 | 2)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-normal text-gray-900 outline-none focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                >
                  <option value={1}>1º turno</option>
                  <option value={2} disabled={!status.secondRoundAvailable}>2º turno {!status.secondRoundAvailable ? '(aguardando configuração oficial)' : ''}</option>
                </select>
              </label>
            </div>
          </section>

          <section aria-labelledby="election-offices" className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
            <h2 id="election-offices" className="text-lg font-bold text-gray-900">Cargos e ordem de exibição</h2>
            <p className="mt-1 text-sm text-gray-500">Ative os cargos desejados e use as setas para alterar a ordem na página pública.</p>
            <div className="mt-4 space-y-2">
              {settings.officeOrder.map((office, index) => (
                <div key={office} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={settings.offices[office]} onChange={() => toggleOffice(office)} className={checkboxClass} />
                    <span className="truncate text-sm font-semibold text-gray-900">{ELECTION_OFFICE_LABELS[office]}</span>
                  </label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveOffice(office, -1)}
                      disabled={index === 0}
                      aria-label={`Mover ${ELECTION_OFFICE_LABELS[office]} para cima`}
                      className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveOffice(office, 1)}
                      disabled={index === settings.officeOrder.length - 1}
                      aria-label={`Mover ${ELECTION_OFFICE_LABELS[office]} para baixo`}
                      className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="election-states" className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="election-states" className="text-lg font-bold text-gray-900">Estados exibidos</h2>
                <p className="mt-1 text-sm text-gray-500">A coleta regional respeita esta seleção e os códigos de UF da configuração oficial do TSE.</p>
              </div>
              <span className="text-xs font-semibold text-gray-500">{settings.selectedStates.length} de {BRAZILIAN_STATES.length} selecionados</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {BRAZILIAN_STATES.map((state) => (
                <label key={state.code} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={settings.selectedStates.includes(state.code)}
                    onChange={() => toggleState(state.code)}
                    className={checkboxClass}
                  />
                  <span className="w-7 font-bold text-gray-900">{state.code}</span>
                  <span className="truncate text-gray-600">{state.name}</span>
                </label>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-gray-500">
              Estados disponíveis na configuração recebida do TSE: {status.availableStates.length ? status.availableStates.join(', ') : 'aguardando a primeira coleta válida'}.
            </p>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 pb-8">
            <p className="max-w-3xl text-xs leading-5 text-gray-500">
              Nenhum campo de votos ou situação é editável neste painel. A página só publica dados cuja assinatura digital e estrutura tenham sido validadas.
            </p>
            <button
              type="button"
              onClick={() => void load(true).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Falha ao atualizar.'))}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Atualizar status
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
