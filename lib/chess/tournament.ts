export type Result = "white" | "black" | "draw";
export type Outcome = "win" | "loss" | "draw";
export type Player = { id: string; name: string };
export type Match = { white: string; black: string; result: Result | null };
export type Round = { matches: Match[]; bye: string | null };
export type Tournament = {
  version: 1;
  draft: string;
  players: Player[];
  byeOrder: string[];
  rounds: Round[];
};
export const STORAGE_KEY = "kernell.chess.tournament.v1";
export const emptyTournament = (): Tournament => ({ version: 1, draft: "", players: [], byeOrder: [], rounds: [] });

export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function parseNames(draft: string): string[] {
  return draft.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
}

export function validateNames(names: string[]): string | null {
  if (names.length < 2) return "Добавьте хотя бы двух игроков.";
  if (names.length > 200) return "В одном турнире может быть до 200 игроков.";
  if (names.some((name) => name.length > 80)) return "Имя игрока должно быть не длиннее 80 символов.";
  const seen = new Set<string>();
  for (const name of names) {
    const normalized = name.normalize("NFKC").toLocaleLowerCase("ru").replace(/\s+/g, " ");
    if (seen.has(normalized)) return `Имя «${name}» повторяется. Добавьте фамилию или другое отличие.`;
    seen.add(normalized);
  }
  return null;
}

export function isComplete(round: Round): boolean {
  return round.matches.every((match) => match.result !== null);
}

export function outcomes(round: Round): Map<string, Outcome> {
  const result = new Map<string, Outcome>();
  for (const match of round.matches) {
    if (match.result === null) continue;
    result.set(match.white, match.result === "draw" ? "draw" : match.result === "white" ? "win" : "loss");
    result.set(match.black, match.result === "draw" ? "draw" : match.result === "black" ? "win" : "loss");
  }
  if (round.bye) result.set(round.bye, "win");
  return result;
}

const pairKey = (a: string, b: string) => [a, b].sort().join(":");

// Edmonds' blossom algorithm: maximum matching on the graph of fresh opponents.
// Pairing the remaining unmatched vertices then gives the fewest repeat games
// possible inside this result group. Random vertex order breaks equivalent ties.
function freshMatching(ids: string[], met: Set<string>): number[] {
  const n = ids.length;
  const edges = ids.map((id, i) => ids.flatMap((other, j) => i !== j && !met.has(pairKey(id, other)) ? [j] : []));
  const match = Array<number>(n).fill(-1);
  let parent: number[], base: number[], used: boolean[], blossom: boolean[];

  function commonBase(a: number, b: number): number {
    const path = Array<boolean>(n).fill(false);
    while (true) {
      a = base[a];
      path[a] = true;
      if (match[a] === -1) break;
      a = parent[match[a]];
    }
    while (!path[base[b]]) b = parent[match[base[b]]];
    return base[b];
  }

  function markPath(vertex: number, root: number, child: number) {
    while (base[vertex] !== root) {
      blossom[base[vertex]] = blossom[base[match[vertex]]] = true;
      parent[vertex] = child;
      child = match[vertex];
      vertex = parent[match[vertex]];
    }
  }

  function augment(root: number): boolean {
    used = Array<boolean>(n).fill(false);
    parent = Array<number>(n).fill(-1);
    base = Array.from({ length: n }, (_, i) => i);
    const queue = [root];
    used[root] = true;
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head];
      for (const u of edges[v]) {
        if (base[v] === base[u] || match[v] === u) continue;
        if (u === root || (match[u] !== -1 && parent[match[u]] !== -1)) {
          const shared = commonBase(v, u);
          blossom = Array<boolean>(n).fill(false);
          markPath(v, shared, u);
          markPath(u, shared, v);
          for (let i = 0; i < n; i++) {
            if (!blossom[base[i]]) continue;
            base[i] = shared;
            if (!used[i]) { used[i] = true; queue.push(i); }
          }
        } else if (parent[u] === -1) {
          parent[u] = v;
          if (match[u] === -1) {
            let end = u;
            while (end !== -1) {
              const previous = parent[end];
              const next = previous === -1 ? -1 : match[previous];
              match[end] = previous;
              if (previous !== -1) match[previous] = end;
              end = next;
            }
            return true;
          }
          used[match[u]] = true;
          queue.push(match[u]);
        }
      }
    }
    return false;
  }

  for (let i = 0; i < n; i++) if (match[i] === -1) augment(i);
  return match;
}

function pairGroup(group: string[], met: Set<string>, random: () => number) {
  const ids = shuffle(group, random);
  const matching = freshMatching(ids, met);
  const pairs: [string, string][] = [];
  const remaining: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (matching[i] === -1) remaining.push(ids[i]);
    else if (matching[i] > i) pairs.push([ids[i], ids[matching[i]]]);
  }
  while (remaining.length > 1) pairs.push([remaining.pop()!, remaining.pop()!]);
  return { pairs, leftover: remaining[0] };
}

export function nextRound(tournament: Tournament, random = Math.random): Round {
  const { players, rounds, byeOrder } = tournament;
  if (players.length < 2) throw new Error("Добавьте хотя бы двух игроков.");
  const previous = rounds.at(-1);
  if (previous && !isComplete(previous)) throw new Error("Сначала укажите результаты всех партий.");
  const bye = players.length % 2 ? byeOrder[rounds.length % byeOrder.length] : null;
  const active = players.map((player) => player.id).filter((id) => id !== bye);
  const last = previous ? outcomes(previous) : null;
  const groups = last
    ? (["win", "draw", "loss"] as const).map((outcome) => active.filter((id) => last.get(id) === outcome))
    : [active];
  const met = new Set(rounds.flatMap((round) => round.matches.map((match) => pairKey(match.white, match.black))));

  let best: [string, string][] = [];
  let bestRepeats = Infinity;
  // Equivalent maximum matchings can leave different players for the cross-group
  // game. Try several random choices to avoid a repeat in that game as well.
  for (let attempt = 0; attempt < 24; attempt++) {
    const pairs: [string, string][] = [];
    const leftovers: string[] = [];
    for (const group of groups) {
      const paired = pairGroup(group, met, random);
      pairs.push(...paired.pairs);
      if (paired.leftover) leftovers.push(paired.leftover);
    }
    if (leftovers.length === 2) pairs.push([leftovers[0], leftovers[1]]);
    const repeats = pairs.filter(([a, b]) => met.has(pairKey(a, b))).length;
    if (repeats < bestRepeats) { best = pairs; bestRepeats = repeats; }
    if (repeats === 0) break;
  }
  return {
    matches: shuffle(best, random).map(([a, b]) => random() < 0.5
      ? { white: a, black: b, result: null }
      : { white: b, black: a, result: null }),
    bye,
  };
}

export function startTournament(draft: string, random = Math.random): Tournament {
  const names = parseNames(draft);
  const error = validateNames(names);
  if (error) throw new Error(error);
  const players = names.map((name, i) => ({ id: `p${i + 1}`, name }));
  const tournament: Tournament = { version: 1, draft, players, byeOrder: shuffle(players.map((p) => p.id), random), rounds: [] };
  return { ...tournament, rounds: [nextRound(tournament, random)] };
}

export function setResult(tournament: Tournament, matchIndex: number, result: Result | null): Tournament {
  const current = tournament.rounds.at(-1);
  if (!current || !current.matches[matchIndex]) return tournament;
  return {
    ...tournament,
    rounds: [...tournament.rounds.slice(0, -1), {
      ...current,
      matches: current.matches.map((match, i) => i === matchIndex ? { ...match, result } : match),
    }],
  };
}

export function undoRound(tournament: Tournament): Tournament {
  if (tournament.rounds.length <= 1) return { ...emptyTournament(), draft: tournament.draft };
  return { ...tournament, rounds: tournament.rounds.slice(0, -1) };
}

export function standings(tournament: Tournament) {
  const rows = tournament.players.map((player) => ({ ...player, points: 0, wins: 0, draws: 0, losses: 0, byes: 0 }));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const round of tournament.rounds) {
    for (const [id, outcome] of outcomes(round)) {
      const row = byId.get(id)!;
      if (id === round.bye) { row.points++; row.byes++; }
      else if (outcome === "win") { row.points++; row.wins++; }
      else if (outcome === "draw") { row.points += 0.5; row.draws++; }
      else row.losses++;
    }
  }
  return rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "ru"));
}

// localStorage is untrusted: reject broken or incompatible snapshots before use.
export function restoreTournament(raw: string): Tournament {
  const data: Tournament = JSON.parse(raw);
  if (!data || data.version !== 1 || typeof data.draft !== "string" || !Array.isArray(data.players)
    || !Array.isArray(data.byeOrder) || !Array.isArray(data.rounds)) throw new Error("Некорректное сохранение.");
  const ids = new Set(data.players.map((p) => p?.id));
  if (ids.size !== data.players.length || data.players.some((p) => !p || typeof p.id !== "string" || !/^p\d+$/.test(p.id) || typeof p.name !== "string")) throw new Error("Некорректные игроки.");
  if (!data.players.length) {
    if (data.rounds.length || data.byeOrder.length) throw new Error("Некорректный турнир.");
    return data;
  }
  if (validateNames(data.players.map((p) => p.name)) || !data.rounds.length
    || data.byeOrder.length !== ids.size || new Set(data.byeOrder).size !== ids.size || data.byeOrder.some((id) => !ids.has(id))) throw new Error("Некорректный состав.");
  data.rounds.forEach((round, i) => {
    const expectedBye = ids.size % 2 ? data.byeOrder[i % ids.size] : null;
    if (!round || !Array.isArray(round.matches) || round.bye !== expectedBye) throw new Error("Некорректный тур.");
    const participants = round.matches.flatMap((match) => {
      if (!match || ![null, "white", "black", "draw"].includes(match.result)) throw new Error("Некорректный результат.");
      return [match.white, match.black];
    });
    if (round.bye) participants.push(round.bye);
    if (participants.length !== ids.size || new Set(participants).size !== ids.size || participants.some((id) => !ids.has(id))
      || (i < data.rounds.length - 1 && !isComplete(round))) throw new Error("Некорректные пары.");
  });
  return data;
}

export const formatPoints = (points: number) => Number.isInteger(points) ? String(points) : points < 1 ? "½" : `${Math.floor(points)}½`;
