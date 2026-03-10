const STORAGE_KEY = "gf-minigames-highscores";

interface HighScores {
  [game: string]: number;
}

function loadScores(): HighScores {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as HighScores;
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

function storeScores(scores: HighScores): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
}

export function getHighScore(game: string): number {
  const scores = loadScores();
  return scores[game] ?? 0;
}

export function saveHighScore(game: string, score: number): void {
  const scores = loadScores();
  const current = scores[game] ?? 0;
  if (score > current) {
    scores[game] = score;
    storeScores(scores);
  }
}
