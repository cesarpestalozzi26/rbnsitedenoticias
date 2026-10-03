import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAZILIAN_STATES, DEFAULT_ELECTION_SETTINGS, normalizeElectionSettings } from './types.ts';
import { getTseCandidatePhotoUrl } from './candidatePhotoUrl.ts';
import { findElectionCycle } from './findElectionCycle.ts';

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

test('candidate photos use only validated official TSE paths', () => {
  assert.equal(
    getTseCandidatePhotoUrl('ele2026', '6257', 'BR', '12345678901'),
    'https://resultados.tse.jus.br/oficial/ele2026/6257/fotos/br/12345678901.jpeg'
  );
  assert.equal(getTseCandidatePhotoUrl('../elsewhere', '6257', 'BR', '12345678901'), null);
  assert.equal(getTseCandidatePhotoUrl('ele2026', '6257', 'BR', '12/../../x'), null);
  assert.equal(getTseCandidatePhotoUrl('ele2026', '6257', 'B/', '12345678901'), null);
});

test('prefers the matching election cycle over supplemental elections in the same year', () => {
  const supplementaryCycle = {
    c: 'ele2024',
    dt: '01/03/2026',
    e: [{ nm: 'Eleições Suplementares' }],
  };
  const generalCycle = {
    c: 'ele2026',
    dt: '04/10/2026',
    e: [{ nm: 'Eleições 2026' }],
  };

  assert.equal(
    findElectionCycle([supplementaryCycle, generalCycle], 2026),
    generalCycle
  );
});
