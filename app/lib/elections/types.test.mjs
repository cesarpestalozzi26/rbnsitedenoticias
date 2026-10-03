import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAZILIAN_STATES, DEFAULT_ELECTION_SETTINGS, normalizeElectionSettings } from './types.ts';

test('election settings stay disabled until explicitly enabled', () => {
  const settings = normalizeElectionSettings(null);

  assert.equal(settings.active, false);
  assert.equal(settings.publicPageEnabled, false);
  assert.equal(settings.autoUpdate, false);
  assert.deepEqual(settings.selectedStates, BRAZILIAN_STATES.map((state) => state.code));
});

test('normalizes only supported offices, states, and round values', () => {
  const settings = normalizeElectionSettings({
    active: true,
    publicPageEnabled: true,
    autoUpdate: true,
    round: 9,
    buttonText: '  Resultados oficiais  ',
    offices: { president: true, invalid: true },
    officeOrder: ['governor', 'governor', 'invalid'],
    selectedStates: ['SP', 'XX', 'SP', 'DF'],
  });

  assert.equal(settings.active, true);
  assert.equal(settings.round, 1);
  assert.equal(settings.buttonText, 'Resultados oficiais');
  assert.deepEqual(settings.officeOrder, ['governor', 'president', 'senator', 'federal-deputy', 'state-deputy']);
  assert.deepEqual(settings.selectedStates, ['SP', 'DF']);
  assert.equal(settings.offices.president, true);
  assert.equal(settings.offices.governor, true);
});

test('default configuration is not mutated by normalization', () => {
  normalizeElectionSettings({ active: true, selectedStates: [] });
  assert.equal(DEFAULT_ELECTION_SETTINGS.active, false);
  assert.equal(DEFAULT_ELECTION_SETTINGS.selectedStates.length, BRAZILIAN_STATES.length);
});
