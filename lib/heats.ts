export function splitIntoHeats<T>(competitors: T[], maxPerHeat = 8) {
  if (!Array.isArray(competitors) || competitors.length === 0) {
    return [] as T[][];
  }

  const size = Math.max(1, Math.floor(maxPerHeat));
  const heats: T[][] = [];

  for (let i = 0; i < competitors.length; i += size) {
    heats.push(competitors.slice(i, i + size));
  }

  return heats;
}
