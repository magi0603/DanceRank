export type CompetitionRound =
  | "final"
  | "semi_final"
  | "quarter_final"
  | "round_of_16";

export function getCompetitionRounds(competitorCount: number) {
  if (!Number.isFinite(competitorCount) || competitorCount <= 0) {
    return [] as CompetitionRound[];
  }

  if (competitorCount <= 8) {
    return ["final"] as CompetitionRound[];
  }

  if (competitorCount <= 16) {
    return ["semi_final", "final"] as CompetitionRound[];
  }

  if (competitorCount <= 32) {
    return ["quarter_final", "semi_final", "final"] as CompetitionRound[];
  }

  return ["round_of_16", "quarter_final", "semi_final", "final"] as CompetitionRound[];
}
