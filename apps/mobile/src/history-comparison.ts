export interface HistoricalAttemptCandidate {
  artworkId: string;
  character: string;
}

export interface HistoricalAttemptSelection<T> {
  error: "CHARACTER_MISMATCH" | null;
  selected: T[];
}

export function toggleHistoricalAttempt<T extends HistoricalAttemptCandidate>(
  selected: T[],
  candidate: T,
): HistoricalAttemptSelection<T> {
  const existingIndex = selected.findIndex(
    (item) => item.artworkId === candidate.artworkId,
  );
  if (existingIndex >= 0) {
    return {
      error: null,
      selected: selected.filter((_, index) => index !== existingIndex),
    };
  }
  if (selected[0] && selected[0].character !== candidate.character) {
    return { error: "CHARACTER_MISMATCH", selected };
  }
  return {
    error: null,
    selected: [...selected.slice(-1), candidate],
  };
}
