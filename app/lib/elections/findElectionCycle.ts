export function findElectionCycle(
  cycles: Record<string, unknown>[],
  year: number
) {
  const yearText = String(year);
  return cycles.find((item) =>
    typeof item.c === 'string' && item.c.toLowerCase().includes(`ele${yearText}`)
  ) ?? cycles.find((item) =>
    Array.isArray(item.e) && item.e.some((election) =>
      election && typeof election === 'object' && 'nm' in election &&
      String(election.nm).includes(yearText)
    )
  ) ?? cycles.find((item) =>
    typeof item.dt === 'string' && item.dt.slice(-4) === yearText
  ) ?? null;
}
