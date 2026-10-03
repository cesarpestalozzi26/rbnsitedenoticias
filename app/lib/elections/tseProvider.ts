import { createPublicKey, verify } from 'node:crypto';
import {
  BRAZILIAN_STATES,
  ELECTION_YEAR,
  type ElectionCandidate,
  type ElectionOffice,
  type ElectionRound,
  type ElectionSnapshot,
} from './types';

const TSE_HOST = 'resultados.tse.jus.br';
const MAX_SIGNED_FILE_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

const DEFAULT_TSE_PUBLIC_JWK = {
  kty: 'OKP',
  use: 'sig',
  key_ops: ['verify'],
  alg: 'EdDSA',
  kid: 'sNbt9Q_fLS65zE1_ZLNV-XRRwPY',
  crv: 'Ed25519',
  x: 'kWlpNHjuws1csyQZwzn3Fhzbi3RD435RbpThtSr4hMc',
};

type FileValidator = { etag?: string; lastModified?: string };
type JwsHeader = { alg?: string; kid?: string; typ?: string };
type JsonObject = Record<string, unknown>;

export type SignedFetchResult<T> =
  | { notModified: true; validator: FileValidator; status: 304 }
  | { notModified: false; validator: FileValidator; status: 200; data: T };

export type TSEOfficeDescriptor = {
  office: ElectionOffice;
  officialLabel: string;
  officeCode: string;
  electionCode: string;
  cycle: string;
  round: ElectionRound;
  availableAreas: string[];
  secondRoundAvailable: boolean;
};

export type TSEElectionConfiguration = {
  cycle: string;
  offices: TSEOfficeDescriptor[];
  availableStates: string[];
  secondRoundAvailable: boolean;
};

type ElectionCandidateFile = {
  ele?: string;
  t?: string;
  tpabr?: string;
  cdabr?: string;
  dg?: string;
  hg?: string;
  idg?: string;
  carg?: Array<{
    cd?: string;
    nmn?: string;
    nv?: string;
    agr?: Array<{
      par?: Array<{
        sg?: string;
        cand?: Array<JsonObject>;
      }>;
    }>;
  }>;
  s?: JsonObject;
  v?: JsonObject;
};

function logTse(event: string, data: Record<string, unknown>) {
  console.info('[ELECTION_TSE]', event, JSON.stringify(data));
}

function getTseBaseUrl() {
  const configured = process.env.TSE_RESULTS_BASE_URL?.trim() || `https://${TSE_HOST}`;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('TSE_RESULTS_BASE_URL não é uma URL válida.');
  }
  if (url.protocol !== 'https:' || url.hostname !== TSE_HOST || url.port || url.username || url.password) {
    throw new Error(`TSE_RESULTS_BASE_URL deve usar HTTPS no domínio oficial ${TSE_HOST}.`);
  }
  return url.origin;
}

function getTrustedJwk() {
  const configured = process.env.TSE_RESULTS_PUBLIC_JWK?.trim();
  if (!configured) return DEFAULT_TSE_PUBLIC_JWK;
  let jwk: typeof DEFAULT_TSE_PUBLIC_JWK;
  try {
    jwk = JSON.parse(configured) as typeof DEFAULT_TSE_PUBLIC_JWK;
  } catch {
    throw new Error('TSE_RESULTS_PUBLIC_JWK não contém uma chave JWK válida.');
  }
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || jwk.alg !== 'EdDSA' || typeof jwk.x !== 'string' || typeof jwk.kid !== 'string') {
    throw new Error('TSE_RESULTS_PUBLIC_JWK não é uma chave pública Ed25519 EdDSA válida.');
  }
  return jwk;
}

function assertSafeRelativePath(path: string) {
  if (!path || path.startsWith('/') || path.includes('..') || /[?#\\]/.test(path)) {
    throw new Error('O caminho do arquivo oficial do TSE é inválido.');
  }
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Arquivo JWS do TSE contém segmento Base64URL inválido.');
  }
  return Buffer.from(value, 'base64url');
}

export function verifyAndParseTseJws<T>(token: string, trustedJwk = getTrustedJwk()): T {
  if (Buffer.byteLength(token, 'utf8') > MAX_SIGNED_FILE_BYTES) {
    throw new Error('Arquivo oficial do TSE excede o limite de tamanho permitido.');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error('Arquivo oficial do TSE não está no formato JWS compacto esperado.');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(decodeBase64Url(encodedHeader).toString('utf8')) as JwsHeader;
  if (header.alg !== 'EdDSA' || header.kid !== trustedJwk.kid) {
    throw new Error('Cabeçalho ou chave de assinatura do arquivo oficial do TSE não reconhecido.');
  }

  let publicKey;
  try {
    publicKey = createPublicKey({ key: trustedJwk, format: 'jwk' });
  } catch {
    throw new Error('Não foi possível importar a chave pública oficial do TSE.');
  }

  const valid = verify(
    null,
    Buffer.from(`${encodedHeader}.${encodedPayload}`, 'ascii'),
    publicKey,
    decodeBase64Url(encodedSignature)
  );
  if (!valid) {
    throw new Error('A assinatura digital do arquivo do TSE é inválida; os dados foram rejeitados.');
  }

  const parsed = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('O conteúdo assinado do TSE não é um objeto JSON válido.');
  }
  return parsed as T;
}

async function fetchWithRetry(url: URL, headers: HeadersInit, retry = 0): Promise<Response> {
  try {
    const response = await fetch(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if ((response.status === 429 || response.status >= 500) && retry < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5_000)
        : 250 * (2 ** retry);
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, headers, retry + 1);
    }
    return response;
  } catch (error) {
    if (retry >= MAX_RETRIES) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** retry)));
    return fetchWithRetry(url, headers, retry + 1);
  }
}

export async function fetchSignedTseFile<T>(
  relativePath: string,
  previous: FileValidator = {}
): Promise<SignedFetchResult<T>> {
  assertSafeRelativePath(relativePath);
  const url = new URL(relativePath, `${getTseBaseUrl()}/`);
  if (url.hostname !== TSE_HOST || url.protocol !== 'https:') {
    throw new Error('O arquivo solicitado não pertence ao host oficial do TSE.');
  }

  const headers = new Headers({ Accept: 'application/jose, application/json;q=0.9' });
  if (previous.etag) headers.set('If-None-Match', previous.etag);
  if (previous.lastModified) headers.set('If-Modified-Since', previous.lastModified);

  const startedAt = Date.now();
  const response = await fetchWithRetry(url, headers);
  const validator = {
    etag: response.headers.get('etag') || previous.etag,
    lastModified: response.headers.get('last-modified') || previous.lastModified,
  };

  if (response.status === 304) {
    logTse('not-modified', { path: relativePath, status: 304, durationMs: Date.now() - startedAt, etag: validator.etag });
    return { notModified: true, validator, status: 304 };
  }
  if (response.status !== 200) {
    throw new Error(`TSE respondeu HTTP ${response.status} para ${relativePath}.`);
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_SIGNED_FILE_BYTES) {
    throw new Error('Arquivo oficial do TSE excede o limite de tamanho permitido.');
  }
  const body = await response.text();
  const data = verifyAndParseTseJws<T>(body);
  logTse('file-verified', {
    path: relativePath,
    status: response.status,
    durationMs: Date.now() - startedAt,
    bytes: Buffer.byteLength(body, 'utf8'),
    etag: validator.etag,
    lastModified: validator.lastModified,
  });
  return { notModified: false, validator, status: 200, data };
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function asArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(asObject).filter((item): item is JsonObject => item !== null) : [];
}

function asString(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function matchOffice(label: string): ElectionOffice | null {
  const normalized = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (normalized === 'presidente' || normalized === 'presidente da republica') return 'president';
  if (normalized === 'governador') return 'governor';
  if (normalized === 'senador') return 'senator';
  if (normalized === 'deputado federal') return 'federal-deputy';
  if (normalized === 'deputado estadual' || normalized === 'deputado distrital') return 'state-deputy';
  return null;
}

function roundElectionId(election: JsonObject, round: ElectionRound) {
  const configuredTurn = asString(election.t);
  const id = round === 1
    ? asString(election.cd)
    : configuredTurn === String(round)
      ? asString(election.cd)
      : asString(election.cdt2);
  return id.trim();
}

export function discoverTseElectionConfiguration(
  globalConfig: JsonObject,
  round: ElectionRound,
  year = ELECTION_YEAR
): TSEElectionConfiguration {
  const cycles = asArray(globalConfig.pl);
  const cycle = cycles.find((item) =>
    asString(item.c).includes(String(year)) ||
    asString(item.dt).slice(-4) === String(year) ||
    asArray(item.e).some((election) => asString(election.nm).includes(String(year)))
  );
  if (!cycle) throw new Error(`A configuração oficial do TSE ainda não contém as Eleições ${year}.`);

  const elections = asArray(cycle.e);
  const descriptors = new Map<string, TSEOfficeDescriptor>();
  let secondRoundAvailable = false;

  for (const election of elections) {
    const firstTurnId = roundElectionId(election, 1);
    const secondTurnId = roundElectionId(election, 2);
    secondRoundAvailable ||= Boolean(secondTurnId);
    const electionId = roundElectionId(election, round);
    if (!electionId) continue;

    for (const area of asArray(election.abr)) {
      const areaCode = asString(area.cd).toLowerCase();
      for (const contest of asArray(area.cp)) {
        const officialLabel = asString(contest.ds).trim();
        const office = matchOffice(officialLabel);
        const officeCode = asString(contest.cd).trim();
        if (!office || !officeCode) continue;

        const descriptor: TSEOfficeDescriptor = {
          office,
          officialLabel,
          officeCode,
          electionCode: electionId,
          cycle: asString(cycle.c),
          round,
          availableAreas: office === 'president'
            ? ['br']
            : office === 'state-deputy' && /distrital/i.test(officialLabel)
              ? ['df']
              : office === 'state-deputy'
                ? BRAZILIAN_STATES.map((state) => state.code.toLowerCase()).filter((code) => code !== 'df')
                : areaCode === 'br'
                  ? BRAZILIAN_STATES.map((state) => state.code.toLowerCase())
                  : [areaCode],
          secondRoundAvailable: Boolean(secondTurnId || firstTurnId),
        };
        const key = `${round}:${office}:${electionId}:${officeCode}`;
        const existing = descriptors.get(key);
        if (existing) {
          if (!existing.availableAreas.includes(areaCode)) existing.availableAreas.push(areaCode);
        } else {
          descriptors.set(key, descriptor);
        }
      }
    }
  }

  const offices = [...descriptors.values()];
  if (offices.length === 0) {
    throw new Error(`A configuração oficial do TSE não disponibiliza cargos do ${round}º turno de ${year}.`);
  }

  return {
    cycle: asString(cycle.c),
    offices,
    availableStates: [],
    secondRoundAvailable,
  };
}

export function discoverTseAvailableStates(municipalityConfig: JsonObject) {
  const officialCodes = new Set<string>(BRAZILIAN_STATES.map((state) => state.code));
  return [...new Set(asArray(municipalityConfig.abr)
    .map((area) => asString(area.cd).toUpperCase())
    .filter((code) => officialCodes.has(code)))];
}

function formatTimestamp(date: unknown, time: unknown) {
  const dateValue = asString(date).trim();
  const timeValue = asString(time).trim();
  if (!dateValue || !timeValue) return '';
  const [day, month, year] = dateValue.split('/');
  if (!day || !month || !year || !/^\d{2}:\d{2}:\d{2}$/.test(timeValue)) return '';
  return `${year}-${month}-${day}T${timeValue}-03:00`;
}

function parseVoteCount(value: string) {
  if (!/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function compareCandidates(left: ElectionCandidate, right: ElectionCandidate) {
  const leftVotes = parseVoteCount(left.votes);
  const rightVotes = parseVoteCount(right.votes);
  if (leftVotes !== null && rightVotes !== null && leftVotes !== rightVotes) {
    return leftVotes > rightVotes ? -1 : 1;
  }
  return left.position - right.position;
}

export function normalizeTseResultFile(
  data: ElectionCandidateFile,
  descriptor: TSEOfficeDescriptor,
  state: string,
  fetchedAt = new Date().toISOString()
): ElectionSnapshot {
  if (asString(data.ele) !== descriptor.electionCode || asString(data.t) !== String(descriptor.round)) {
    throw new Error('O arquivo do TSE pertence a outra eleição ou turno; os dados foram rejeitados.');
  }

  const area = asString(data.cdabr).toLowerCase();
  const requestedArea = state.toLowerCase();
  if (area !== requestedArea || (area !== 'br' && !BRAZILIAN_STATES.some((item) => item.code.toLowerCase() === requestedArea))) {
    throw new Error('O arquivo do TSE pertence a outra abrangência geográfica; os dados foram rejeitados.');
  }

  const sourceOffice = asArray(data.carg).find((item) => asString(item.cd) === descriptor.officeCode);
  if (!sourceOffice) throw new Error('O arquivo oficial do TSE não contém o cargo esperado.');

  const candidates: ElectionCandidate[] = [];
  const candidateIds = new Set<string>();

  for (const group of asArray(sourceOffice.agr)) {
    for (const party of asArray(group.par)) {
      const partyLabel = asString(party.sg).trim();
      for (const candidate of asArray(party.cand)) {
        const id = asString(candidate.sqcand).trim() || `${asString(candidate.n)}:${asString(candidate.nm)}`;
        const name = asString(candidate.nm).trim();
        const number = asString(candidate.n).trim();
        const votes = asString(candidate.vap).trim();
        const percent = asString(candidate.pvap).trim();
        const sequence = Number(candidate.seq);
        if (!id || !name || !number || !/^\d+$/.test(votes) || !/^\d+(,\d+)?$/.test(percent)) {
          throw new Error('O arquivo do TSE contém candidato com campos ou votos inválidos.');
        }
        if (candidateIds.has(id)) throw new Error('O arquivo do TSE contém candidato duplicado.');
        candidateIds.add(id);
        candidates.push({
          id,
          number,
          name,
          party: partyLabel,
          votes,
          percent,
          position: Number.isInteger(sequence) && sequence > 0 ? sequence : candidates.length + 1,
          officialStatus: asString(candidate.st).trim(),
          electedCode: asString(candidate.e).trim(),
        });
      }
    }
  }

  const totalization = asObject(data.s);
  if (!totalization) throw new Error('O arquivo do TSE não contém os dados de totalização esperados.');
  const validVotes = asString(asObject(data.v)?.vv).trim();
  const orderedCandidates = candidates.sort(compareCandidates).map((candidate, index) => ({
    ...candidate,
    position: index + 1,
  }));

  return {
    electionYear: ELECTION_YEAR,
    round: descriptor.round,
    office: descriptor.office,
    officeLabel: asString(sourceOffice.nmn).trim() || descriptor.officialLabel,
    state: state.toUpperCase(),
    stateLabel: state.toLowerCase() === 'br'
      ? 'Brasil'
      : BRAZILIAN_STATES.find((item) => item.code === state.toUpperCase())?.name ?? state.toUpperCase(),
    seats: asString(sourceOffice.nv).trim(),
    electionCode: descriptor.electionCode,
    sourceVersion: asString(data.idg).trim(),
    sourceUpdatedAt: formatTimestamp(data.dg, data.hg),
    fetchedAt,
    totalization: {
      totalSections: asString(totalization.ts).trim(),
      sectionsCounted: asString(totalization.st).trim(),
      percentCounted: asString(totalization.pst).trim(),
      validVotes,
    },
    candidates: orderedCandidates,
  };
}

export function getTseFilePath(
  globalConfig: JsonObject,
  kind: 'cm' | 'u',
  cycle: string,
  electionCode: string,
  state: string,
  officeCode?: string
) {
  const directory = asArray(globalConfig.arq).find((item) => asString(item.tp) === kind);
  const template = asString(directory?.dir);
  if (!template) throw new Error(`A configuração oficial do TSE não informou o diretório do arquivo ${kind}.`);

  let relativeDirectory = template
    .replace('<base>/', '')
    .replace('<ambiente>', 'oficial')
    .replace('<ciclo>', cycle)
    .replace('<cd_eleicao>', electionCode)
    .replace('<uf>', state.toLowerCase());
  if (relativeDirectory.startsWith('/')) relativeDirectory = relativeDirectory.slice(1);
  if (relativeDirectory.includes('<') || relativeDirectory.includes('>')) {
    throw new Error(`A configuração oficial do TSE possui variáveis não resolvidas no arquivo ${kind}.`);
  }
  assertSafeRelativePath(relativeDirectory);

  if (kind === 'cm') {
    return `${relativeDirectory}/mun-e${electionCode.padStart(6, '0')}-cm.jws`;
  }
  if (!officeCode) throw new Error('O código oficial do cargo é obrigatório para consultar resultados do TSE.');
  return `${relativeDirectory}/${state.toLowerCase()}-c${officeCode.padStart(4, '0')}-e${electionCode.padStart(6, '0')}-u.jws`;
}
