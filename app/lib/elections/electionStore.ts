import { DEFAULT_ELECTION_SETTINGS, type ElectionCollectorStatus, type ElectionSettings, type ElectionSnapshot } from './types';

const SETTINGS_ID = 'election-2026:settings';
const COLLECTOR_ID = 'election-2026:collector';
const LOCK_ID = 'election-2026:collector-lock';
const SNAPSHOT_ID_PREFIX = 'election-2026:snapshot';

type StoredRow<T> = { id: string; payload: T; updated_at?: string };

function readEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim().replace(/^["']|["']$/g, '');
    if (value && value !== '[SENSITIVE]') return value;
  }
  return '';
}

function getStorage() {
  const baseUrl = readEnvironmentValue('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = readEnvironmentValue('SUPABASE_SERVICE_ROLE_KEY');
  if (!baseUrl || !serviceKey) {
    throw new Error('A apuração eleitoral exige NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor.');
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('A URL configurada para o Supabase é inválida.');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) {
    throw new Error('A apuração eleitoral exige uma URL HTTPS válida do Supabase.');
  }

  return {
    tableUrl: `${parsed.origin}/rest/v1/pz_news_settings`,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  };
}

async function getRow<T>(id: string): Promise<StoredRow<T> | null> {
  const { tableUrl, headers } = getStorage();
  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: 'id,payload,updated_at',
    limit: '1',
  });
  const response = await fetch(`${tableUrl}?${params}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    throw new Error(`Não foi possível ler o armazenamento da apuração (${response.status}).`);
  }
  const rows = await response.json() as StoredRow<T>[];
  return rows[0] ?? null;
}

async function upsertRow<T>(id: string, payload: T) {
  const { tableUrl, headers } = getStorage();
  const response = await fetch(tableUrl, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id, payload, updated_at: new Date().toISOString() }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error(`Não foi possível persistir a apuração no Supabase (${response.status}): ${detail}`);
  }
}

export async function getElectionSettings(): Promise<ElectionSettings> {
  const row = await getRow<unknown>(SETTINGS_ID);
  if (!row) return structuredClone(DEFAULT_ELECTION_SETTINGS);
  const value = row.payload;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('As configurações salvas da apuração eleitoral estão inválidas.');
  }
  return value as ElectionSettings;
}

export async function saveElectionSettings(settings: ElectionSettings) {
  await upsertRow(SETTINGS_ID, settings);

  // The row is inserted before collection is enabled. Subsequent lock claims
  // use one conditional Postgres UPDATE, which is atomic across Vercel instances.
  const lock = await getRow<{ leaseUntil?: string; owner?: string }>(LOCK_ID);
  if (!lock) {
    await upsertRow(LOCK_ID, { leaseUntil: '1970-01-01T00:00:00.000Z', owner: '' });
  }
}

export async function getElectionCollectorState(): Promise<{
  status: ElectionCollectorStatus;
  validators: Record<string, { etag?: string; lastModified?: string }>;
  verifiedGlobalConfig: Record<string, unknown> | null;
  verifiedMunicipalityConfig: Record<string, unknown> | null;
}> {
  const row = await getRow<{
    status?: ElectionCollectorStatus;
    validators?: Record<string, { etag?: string; lastModified?: string }>;
    verifiedGlobalConfig?: Record<string, unknown> | null;
    verifiedMunicipalityConfig?: Record<string, unknown> | null;
  }>(COLLECTOR_ID);

  return {
    status: row?.payload.status ?? {
      sourceStatus: 'unknown',
      lastCheckedAt: null,
      lastUpdatedAt: null,
      nextCheckAt: null,
      lastError: null,
      consecutiveErrors: 0,
      circuitOpenUntil: null,
      electionConfigAvailable: false,
      secondRoundAvailable: false,
      availableStates: [],
    },
    validators: row?.payload.validators ?? {},
    verifiedGlobalConfig: row?.payload.verifiedGlobalConfig ?? null,
    verifiedMunicipalityConfig: row?.payload.verifiedMunicipalityConfig ?? null,
  };
}

export async function saveElectionCollectorState(state: Awaited<ReturnType<typeof getElectionCollectorState>>) {
  await upsertRow(COLLECTOR_ID, state);
}

export async function saveElectionSnapshot(snapshot: ElectionSnapshot) {
  const id = [SNAPSHOT_ID_PREFIX, snapshot.round, snapshot.state.toLowerCase(), snapshot.office].join(':');
  await upsertRow(id, snapshot);
}

export async function getElectionSnapshot(round: number, state: string, office: string) {
  const id = [SNAPSHOT_ID_PREFIX, round, state.toLowerCase(), office].join(':');
  const row = await getRow<unknown>(id);
  if (!row) return null;
  if (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
    throw new Error('O último resultado salvo para essa abrangência está inválido.');
  }
  return row.payload as ElectionSnapshot;
}

export async function claimElectionCollectorLock(owner: string, leaseSeconds: number) {
  const { tableUrl, headers } = getStorage();
  const now = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  const params = new URLSearchParams({
    id: `eq.${LOCK_ID}`,
    'payload->>leaseUntil': `lt.${now}`,
  });
  const response = await fetch(`${tableUrl}?${params}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ payload: { leaseUntil, owner }, updated_at: now }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Não foi possível adquirir a trava de coleta da apuração (${response.status}).`);
  }
  const rows = await response.json() as Array<{ id: string }>;
  return rows.length === 1;
}

export async function releaseElectionCollectorLock(owner: string) {
  const { tableUrl, headers } = getStorage();
  const params = new URLSearchParams({
    id: `eq.${LOCK_ID}`,
    'payload->>owner': `eq.${owner}`,
  });
  const response = await fetch(`${tableUrl}?${params}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      payload: { leaseUntil: '1970-01-01T00:00:00.000Z', owner: '' },
      updated_at: new Date().toISOString(),
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Não foi possível liberar a trava de coleta da apuração (${response.status}).`);
  }
}
