export const ELECTION_YEAR = 2026;

export const ELECTION_OFFICES = [
  'president',
  'governor',
  'senator',
  'federal-deputy',
  'state-deputy',
] as const;

export type ElectionOffice = (typeof ELECTION_OFFICES)[number];
export type ElectionRound = 1 | 2;

export const ELECTION_OFFICE_LABELS: Record<ElectionOffice, string> = {
  president: 'Presidente da República',
  governor: 'Governador',
  senator: 'Senador',
  'federal-deputy': 'Deputado Federal',
  'state-deputy': 'Deputado Estadual/Distrital',
};

export const BRAZILIAN_STATES = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PR', name: 'Paraná' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'TO', name: 'Tocantins' },
] as const;

export type ElectionSettings = {
  active: boolean;
  visible: boolean;
  highlighted: boolean;
  publicPageEnabled: boolean;
  autoUpdate: boolean;
  buttonText: string;
  round: ElectionRound;
  offices: Record<ElectionOffice, boolean>;
  officeOrder: ElectionOffice[];
  selectedStates: string[];
};

export const DEFAULT_ELECTION_SETTINGS: ElectionSettings = {
  active: false,
  visible: false,
  highlighted: false,
  publicPageEnabled: false,
  autoUpdate: false,
  buttonText: 'Apuração Eleitoral',
  round: 1,
  offices: {
    president: true,
    governor: true,
    senator: true,
    'federal-deputy': true,
    'state-deputy': true,
  },
  officeOrder: [...ELECTION_OFFICES],
  selectedStates: BRAZILIAN_STATES.map((state) => state.code),
};

export type ElectionCandidate = {
  id: string;
  number: string;
  name: string;
  party: string;
  votes: string;
  percent: string;
  position: number;
  officialStatus: string;
  electedCode: string;
};

export type ElectionTotalization = {
  totalSections: string;
  sectionsCounted: string;
  percentCounted: string;
  validVotes: string;
};

export type ElectionSnapshot = {
  electionYear: number;
  round: ElectionRound;
  office: ElectionOffice;
  officeLabel: string;
  state: string;
  stateLabel: string;
  seats: string;
  electionCode: string;
  sourceVersion: string;
  sourceUpdatedAt: string;
  fetchedAt: string;
  totalization: ElectionTotalization;
  candidates: ElectionCandidate[];
};

export type ElectionCollectorStatus = {
  sourceStatus: 'unknown' | 'connected' | 'stale' | 'error';
  lastCheckedAt: string | null;
  lastUpdatedAt: string | null;
  nextCheckAt: string | null;
  lastError: string | null;
  consecutiveErrors: number;
  circuitOpenUntil: string | null;
  electionConfigAvailable: boolean;
  secondRoundAvailable: boolean;
  availableStates: string[];
};

export const DEFAULT_ELECTION_COLLECTOR_STATUS: ElectionCollectorStatus = {
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
};

export function normalizeElectionSettings(value: unknown): ElectionSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return structuredClone(DEFAULT_ELECTION_SETTINGS);
  }

  const settings = value as Partial<ElectionSettings>;
  const offices = Object.fromEntries(
    ELECTION_OFFICES.map((office) => [office, settings.offices?.[office] !== false])
  ) as Record<ElectionOffice, boolean>;
  const requestedOrder = Array.isArray(settings.officeOrder)
    ? settings.officeOrder.filter(
        (office): office is ElectionOffice =>
          typeof office === 'string' && ELECTION_OFFICES.includes(office as ElectionOffice)
      )
    : [];
  const uniqueOrder = [...new Set(requestedOrder)];
  const officeOrder = [
    ...uniqueOrder,
    ...ELECTION_OFFICES.filter((office) => !uniqueOrder.includes(office)),
  ];
  const selectedStates = Array.isArray(settings.selectedStates)
    ? [...new Set(settings.selectedStates.filter(
        (state): state is string =>
          typeof state === 'string' && BRAZILIAN_STATES.some((item) => item.code === state)
      ))]
    : [...DEFAULT_ELECTION_SETTINGS.selectedStates];
  const buttonText = typeof settings.buttonText === 'string' ? settings.buttonText.trim() : '';

  return {
    active: settings.active === true,
    visible: settings.visible === true,
    highlighted: settings.highlighted === true,
    publicPageEnabled: settings.publicPageEnabled === true,
    autoUpdate: settings.autoUpdate === true,
    buttonText: buttonText.slice(0, 48) || DEFAULT_ELECTION_SETTINGS.buttonText,
    round: settings.round === 2 ? 2 : 1,
    offices,
    officeOrder,
    selectedStates,
  };
}
