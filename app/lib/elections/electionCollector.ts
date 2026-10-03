import { randomUUID } from 'node:crypto';
import {
  ELECTION_YEAR,
  ELECTION_OFFICE_LABELS,
  type ElectionCollectorStatus,
  type ElectionOffice,
  type ElectionSettings,
} from './types';
import {
  discoverTseAvailableStates,
  discoverTseElectionConfiguration,
  fetchSignedTseFile,
  getTseFilePath,
  normalizeTseResultFile,
  type TSEOfficeDescriptor,
} from './tseProvider';
import {
  getElectionCollectorState,
  getElectionSettings,
  claimElectionCollectorLock,
  releaseElectionCollectorLock,
  saveElectionCollectorState,
  saveElectionSnapshot,
} from './electionStore';

const BACKOFF_CAP_MS = 60 * 60 * 1000;
const LOCK_LEASE_SECONDS = 240;

type Validator = { etag?: string; lastModified?: string };
type StoredCollectorState = Awaited<ReturnType<typeof getElectionCollectorState>>;

function logCollector(event: string, data: Record<string, unknown>) {
  console.info('[ELECTION_COLLECTOR]', event, JSON.stringify(data));
}

function getPollIntervalMs() {
  const configured = Number(process.env.ELECTION_POLL_INTERVAL);
  const seconds = Number.isInteger(configured) ? Math.max(60, Math.min(configured, 3600)) : 60;
  return seconds * 1000;
}

function mergeMunicipalityConfigs(configs: Record<string, unknown>[]) {
  const areas = new Map<string, Record<string, unknown>>();
  for (const config of configs) {
    const records = Array.isArray(config.abr) ? config.abr : [];
    for (const item of records) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const area = item as Record<string, unknown>;
      const code = typeof area.cd === 'string' ? area.cd.toLowerCase() : '';
      if (code) areas.set(code, area);
    }
  }
  return { abr: [...areas.values()] };
}

function readValidator(state: StoredCollectorState, key: string): Validator {
  return state.validators[key] ?? {};
}

function isOfficeEnabled(settings: ElectionSettings, office: ElectionOffice) {
  return settings.offices[office] === true;
}

function buildResultTasks(
  settings: ElectionSettings,
  availableStates: string[],
  descriptors: TSEOfficeDescriptor[]
) {
  const validStates = new Set(availableStates);
  const requestedStates = new Set(settings.selectedStates.filter((state) => validStates.has(state)));
  const tasks: Array<{ descriptor: TSEOfficeDescriptor; state: string }> = [];

  for (const descriptor of descriptors) {
    if (!isOfficeEnabled(settings, descriptor.office)) continue;
    if (descriptor.office === 'president') {
      if (descriptor.availableAreas.includes('br')) tasks.push({ descriptor, state: 'BR' });
      continue;
    }
    for (const state of requestedStates) {
      if (descriptor.availableAreas.includes(state.toLowerCase())) {
        tasks.push({ descriptor, state });
      }
    }
  }
  return tasks;
}

async function collectResultFile(
  task: { descriptor: TSEOfficeDescriptor; state: string },
  cycle: string,
  globalConfig: Record<string, unknown>,
  state: StoredCollectorState,
  validators: Record<string, Validator>
): Promise<{ result: 'changed' | 'unchanged'; sourceUpdatedAt: string | null }> {
  const relativePath = getTseFilePath(
    globalConfig,
    'u',
    cycle,
    task.descriptor.electionCode,
    task.state,
    task.descriptor.officeCode
  );
  const previousValidator = readValidator(state, relativePath);
  const response = await fetchSignedTseFile<Record<string, unknown>>(relativePath, previousValidator);
  if (response.notModified) {
    validators[relativePath] = response.validator;
    return { result: 'unchanged', sourceUpdatedAt: null };
  }

  const snapshot = normalizeTseResultFile(
    response.data,
    task.descriptor,
    task.state,
    new Date().toISOString()
  );
  if (snapshot.electionYear !== 2026 || snapshot.round !== task.descriptor.round) {
    throw new Error('Validação interna rejeitou arquivo do TSE com ano ou turno incorreto.');
  }

  await saveElectionSnapshot(snapshot);
  validators[relativePath] = response.validator;
  logCollector('snapshot-saved', {
    electionYear: snapshot.electionYear,
    round: snapshot.round,
    office: snapshot.office,
    state: snapshot.state,
    candidates: snapshot.candidates.length,
    sourceVersion: snapshot.sourceVersion,
  });
  return { result: 'changed', sourceUpdatedAt: snapshot.sourceUpdatedAt || null };
}

function computeRetryState(previousErrors: number, hasErrors: boolean, now: number) {
  const consecutiveErrors = hasErrors ? previousErrors + 1 : 0;
  const multiplier = 2 ** Math.min(consecutiveErrors, 6);
  const intervalMs = Math.min(getPollIntervalMs() * multiplier, BACKOFF_CAP_MS);
  return {
    consecutiveErrors,
    circuitOpenUntil: consecutiveErrors >= 5 ? new Date(now + intervalMs).toISOString() : null,
    nextCheckAt: new Date(now + intervalMs).toISOString(),
  };
}

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message.slice(0, 500) : 'Falha não identificada na coleta oficial do TSE.';
}

export async function runElectionCollection() {
  const startedAt = Date.now();
  const settings = await getElectionSettings();
  if (!settings.active || !settings.autoUpdate) {
    logCollector('skipped', { reason: !settings.active ? 'inactive' : 'automatic-updates-disabled' });
    return { skipped: true, reason: !settings.active ? 'inactive' : 'automatic-updates-disabled' };
  }

  const owner = randomUUID();
  const acquired = await claimElectionCollectorLock(owner, LOCK_LEASE_SECONDS);
  if (!acquired) {
    logCollector('skipped', { reason: 'collector-lock-held' });
    return { skipped: true, reason: 'collector-lock-held' };
  }

  let collectorState: StoredCollectorState | null = null;
  try {
    collectorState = await getElectionCollectorState();
    const now = Date.now();
    const circuitOpenUntil = collectorState.status.circuitOpenUntil
      ? Date.parse(collectorState.status.circuitOpenUntil)
      : 0;
    if (circuitOpenUntil > now) {
      logCollector('skipped', {
        reason: 'circuit-open',
        circuitOpenUntil: collectorState.status.circuitOpenUntil,
      });
      return { skipped: true, reason: 'circuit-open' };
    }
    const nextCheckAt = collectorState.status.nextCheckAt ? Date.parse(collectorState.status.nextCheckAt) : 0;
    if (nextCheckAt > now) {
      logCollector('skipped', { reason: 'poll-interval', nextCheckAt: collectorState.status.nextCheckAt });
      return { skipped: true, reason: 'poll-interval' };
    }

    const validators: Record<string, Validator> = { ...collectorState.validators };
    const globalPath = 'oficial/comum/config/ele-c.jws';
    const globalFetch = await fetchSignedTseFile<Record<string, unknown>>(
      globalPath,
      readValidator(collectorState, globalPath)
    );
    if (globalFetch.status === 200) validators[globalPath] = globalFetch.validator;
    const globalConfig = globalFetch.notModified
      ? collectorState.verifiedGlobalConfig
      : globalFetch.data;
    if (!globalConfig) {
      throw new Error('O TSE respondeu 304, mas não existe configuração global previamente validada.');
    }

    const firstRoundConfig = discoverTseElectionConfiguration(globalConfig, 1);
    if (settings.round === 2 && !firstRoundConfig.secondRoundAvailable) {
      const checkedAt = new Date().toISOString();
      const retry = computeRetryState(0, false, now);
      const status: ElectionCollectorStatus = {
        ...collectorState.status,
        sourceStatus: 'connected',
        lastCheckedAt: checkedAt,
        nextCheckAt: retry.nextCheckAt,
        lastError: 'O TSE ainda não disponibilizou a configuração do segundo turno.',
        consecutiveErrors: 0,
        circuitOpenUntil: null,
        electionConfigAvailable: true,
        secondRoundAvailable: false,
      };
      await saveElectionCollectorState({
        ...collectorState,
        status,
        validators,
        verifiedGlobalConfig: globalConfig,
      });
      logCollector('second-round-not-configured', { electionYear: 2026, round: 2 });
      return { skipped: true, reason: 'second-round-not-configured' };
    }

    const electionConfig = settings.round === 1
      ? firstRoundConfig
      : discoverTseElectionConfiguration(globalConfig, 2);
    const municipalityConfigs: Record<string, unknown>[] = [];
    const electionCodes = [...new Set(electionConfig.offices.map((item) => item.electionCode))];
    for (const electionCode of electionCodes) {
      const municipalityPath = getTseFilePath(
        globalConfig,
        'cm',
        electionConfig.cycle,
        electionCode,
        'br'
      );
      const municipalityFetch = await fetchSignedTseFile<Record<string, unknown>>(
        municipalityPath,
        readValidator(collectorState, municipalityPath)
      );
      if (municipalityFetch.notModified) {
        const previousMunicipality = collectorState.verifiedMunicipalityConfig;
        if (!previousMunicipality) {
          throw new Error('O TSE respondeu 304, mas não existe configuração territorial previamente validada.');
        }
        municipalityConfigs.push(previousMunicipality);
      } else {
        validators[municipalityPath] = municipalityFetch.validator;
        municipalityConfigs.push(municipalityFetch.data);
      }
    }

    const municipalityConfig = mergeMunicipalityConfigs(municipalityConfigs);
    const availableStates = discoverTseAvailableStates(municipalityConfig);
    if (availableStates.length === 0) {
      throw new Error('A configuração territorial oficial do TSE não contém UFs reconhecidas.');
    }

    const tasks = buildResultTasks(settings, availableStates, electionConfig.offices);
    if (tasks.length === 0) {
      throw new Error('Não há cargos e UFs habilitados com dados na configuração oficial do TSE.');
    }
    logCollector('collection-started', {
      electionYear: ELECTION_YEAR,
      round: settings.round,
      tasks: tasks.length,
      offices: [...new Set(tasks.map((item) => item.descriptor.office))],
      selectedStates: settings.selectedStates.length,
    });

    const outcomes: Array<{
      path: string;
      state: string;
      office: ElectionOffice;
      result: 'changed' | 'unchanged' | 'failed';
      sourceUpdatedAt?: string | null;
      error?: string;
    }> = [];
    for (let index = 0; index < tasks.length; index += 4) {
      const batch = tasks.slice(index, index + 4);
      const settled = await Promise.allSettled(batch.map(async (task) => {
        const collected = await collectResultFile(task, electionConfig.cycle, globalConfig, collectorState!, validators);
        const path = getTseFilePath(globalConfig, 'u', electionConfig.cycle, task.descriptor.electionCode, task.state, task.descriptor.officeCode);
        outcomes.push({ path, state: task.state, office: task.descriptor.office, ...collected });
      }));
      for (let offset = 0; offset < settled.length; offset += 1) {
        const item = settled[offset];
        if (item.status === 'rejected') {
          const task = batch[offset];
          const message = errorMessage(item.reason);
          outcomes.push({
            path: getTseFilePath(globalConfig, 'u', electionConfig.cycle, task.descriptor.electionCode, task.state, task.descriptor.officeCode),
            state: task.state,
            office: task.descriptor.office,
            result: 'failed',
            error: message,
          });
          console.error('[ELECTION_TSE]', 'file-rejected', JSON.stringify({ state: task.state, office: task.descriptor.office, message }));
        }
      }
    }

    const failures = outcomes.filter((item) => item.result === 'failed');
    const changed = outcomes.filter((item) => item.result === 'changed').length;
    const unchanged = outcomes.filter((item) => item.result === 'unchanged').length;
    const finishedAt = Date.now();
    const retry = computeRetryState(collectorState.status.consecutiveErrors, failures.length > 0, finishedAt);
    const sourceTimes = outcomes
      .filter((item) => item.result === 'changed')
      .map((item) => item.sourceUpdatedAt ?? '')
      .filter(Boolean);
    const fetchedAt = new Date(finishedAt).toISOString();
    const lastUpdatedAt = sourceTimes.sort().at(-1) || collectorState.status.lastUpdatedAt;
    const status: ElectionCollectorStatus = {
      sourceStatus: failures.length === 0 ? 'connected' : lastUpdatedAt ? 'stale' : 'error',
      lastCheckedAt: fetchedAt,
      lastUpdatedAt,
      nextCheckAt: retry.nextCheckAt,
      lastError: failures.length > 0
        ? failures.slice(0, 5).map((item) => `${item.state}/${ELECTION_OFFICE_LABELS[item.office]}: ${item.error}`).join(' | ')
        : null,
      consecutiveErrors: retry.consecutiveErrors,
      circuitOpenUntil: retry.circuitOpenUntil,
      electionConfigAvailable: true,
      secondRoundAvailable: firstRoundConfig.secondRoundAvailable,
      availableStates,
    };

    const nextState: StoredCollectorState = {
      status,
      validators,
      verifiedGlobalConfig: globalConfig,
      verifiedMunicipalityConfig: municipalityConfig,
    };
    await saveElectionCollectorState(nextState);
    const result = {
      skipped: false,
      checked: outcomes.length,
      changed,
      unchanged,
      failed: failures.length,
      durationMs: Date.now() - startedAt,
      lastUpdatedAt,
    };
    logCollector('collection-finished', result);
    if (failures.length > 0 && changed === 0 && unchanged === 0) {
      throw new Error(status.lastError || 'Todos os arquivos consultados pelo coletor falharam.');
    }
    return result;
  } catch (error) {
    const message = errorMessage(error);
    console.error('[ELECTION_COLLECTOR]', 'collection-failed', JSON.stringify({
      durationMs: Date.now() - startedAt,
      message,
    }));
    if (collectorState) {
      const failedAt = Date.now();
      const retry = computeRetryState(collectorState.status.consecutiveErrors, true, failedAt);
      const status: ElectionCollectorStatus = {
        ...collectorState.status,
        sourceStatus: collectorState.status.lastUpdatedAt ? 'stale' : 'error',
        lastCheckedAt: new Date(failedAt).toISOString(),
        nextCheckAt: retry.nextCheckAt,
        lastError: message,
        consecutiveErrors: retry.consecutiveErrors,
        circuitOpenUntil: retry.circuitOpenUntil,
      };
      try {
        await saveElectionCollectorState({ ...collectorState, status });
      } catch (stateError) {
        console.error('[ELECTION_CACHE]', 'collector-state-save-failed', JSON.stringify({ message: errorMessage(stateError) }));
      }
    }
    throw error;
  } finally {
    await releaseElectionCollectorLock(owner);
  }
}
