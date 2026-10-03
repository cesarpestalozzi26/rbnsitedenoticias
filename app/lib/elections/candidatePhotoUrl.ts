const TSE_HOST = 'resultados.tse.jus.br';

export function getTseCandidatePhotoUrl(
  cycle: string,
  electionCode: string,
  state: string,
  candidateId: string
) {
  const stateCode = state.toLowerCase();
  if (
    !/^[a-zA-Z0-9_-]{1,32}$/.test(cycle) ||
    !/^\d{1,8}$/.test(electionCode) ||
    !/^[a-z]{2}$/.test(stateCode) ||
    !/^\d{1,20}$/.test(candidateId)
  ) {
    return null;
  }

  return `https://${TSE_HOST}/oficial/${cycle}/${electionCode}/fotos/${stateCode}/${candidateId}.jpeg`;
}
