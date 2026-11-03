import test from "node:test";
import assert from "node:assert/strict";
import {
  startTournament, nextRound, setResult, undoRound, standings, outcomes,
  restoreTournament, emptyTournament, validateNames, parseNames, formatPoints,
} from "../lib/chess/tournament.ts";

function seeded(seed = 42) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
const roster = (n) => Array.from({ length: n }, (_, i) => `Игрок ${i + 1}`).join("\n");
const key = (a, b) => [a, b].sort().join(":");
function finish(tournament, random = seeded()) {
  for (let i = 0; i < tournament.rounds.at(-1).matches.length; i++) {
    tournament = setResult(tournament, i, ["white", "black", "draw"][Math.floor(random() * 3)]);
  }
  return tournament;
}

test("roster parsing, duplicate detection and limits", () => {
  assert.deepEqual(parseNames("  Анна \n\n Борис\r\n"), ["Анна", "Борис"]);
  assert.equal(validateNames(["Анна", "Борис"]), null);
  assert.ok(validateNames(["Анна", "АННА"]));
  assert.ok(validateNames(["Анна  Иванова", "Анна Иванова"]));
  assert.ok(validateNames(["Анна"]));
  assert.ok(validateNames(Array.from({ length: 201 }, (_, i) => String(i))));
});

test("first round is random and contains every player exactly once", () => {
  const variants = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const tournament = startTournament(roster(12), seeded(seed));
    const ids = tournament.rounds[0].matches.flatMap((m) => [m.white, m.black]);
    assert.equal(new Set(ids).size, 12);
    assert.equal(ids.length, 12);
    variants.add(JSON.stringify(tournament.rounds));
  }
  assert.ok(variants.size > 1);
});

test("next round is blocked until all results are entered; a result can be cleared", () => {
  let tournament = startTournament(roster(4), seeded());
  assert.throws(() => nextRound(tournament));
  tournament = setResult(tournament, 0, "white");
  assert.throws(() => nextRound(tournament));
  tournament = setResult(tournament, 1, "draw");
  assert.doesNotThrow(() => nextRound(tournament));
  tournament = setResult(tournament, 0, null);
  assert.throws(() => nextRound(tournament));
});

test("winner, loser and draw groups stay together, with only parity leftovers crossing", () => {
  for (let n = 2; n <= 32; n++) {
    const random = seeded(n);
    let tournament = startTournament(roster(n), random);
    for (let turn = 0; turn < 12; turn++) {
      tournament = finish(tournament, random);
      const previous = outcomes(tournament.rounds.at(-1));
      const next = nextRound(tournament, random);
      const members = next.matches.flatMap((m) => [m.white, m.black]).concat(next.bye ? [next.bye] : []);
      assert.equal(members.length, n);
      assert.equal(new Set(members).size, n);
      const groupSizes = ["win", "draw", "loss"].map((outcome) => [...previous].filter(([id, value]) => id !== next.bye && value === outcome).length);
      const crossings = next.matches.filter((m) => previous.get(m.white) !== previous.get(m.black)).length;
      assert.equal(crossings, groupSizes.filter((size) => size % 2).length / 2);
      tournament = { ...tournament, rounds: [...tournament.rounds, next] };
      assert.deepEqual(restoreTournament(JSON.stringify(tournament)), tournament);
    }
  }
});

test("bye rotates through all players, scores one point and counts as a win", () => {
  const random = seeded(1);
  let tournament = startTournament(roster(5), random);
  const byes = [];
  for (let i = 0; i < 11; i++) {
    const current = tournament.rounds.at(-1);
    byes.push(current.bye);
    assert.equal(outcomes(current).get(current.bye), "win");
    tournament = finish(tournament, random);
    const scores = standings(tournament);
    assert.equal(scores.reduce((sum, p) => sum + p.points, 0), (i + 1) * 3);
    const next = nextRound(tournament, random);
    tournament = { ...tournament, rounds: [...tournament.rounds, next] };
  }
  assert.equal(new Set(byes.slice(0, 5)).size, 5);
  assert.deepEqual(byes.slice(0, 5), byes.slice(5, 10));
  assert.equal(byes[0], byes[10]);
});

test("scoring: win 1, draw ½, loss 0; unfinished games contribute nothing", () => {
  let tournament = startTournament(roster(5), seeded());
  const current = tournament.rounds[0];
  tournament = setResult(tournament, 0, "white");
  tournament = setResult(tournament, 1, "draw");
  const rows = new Map(standings(tournament).map((p) => [p.id, p]));
  assert.equal(rows.get(current.matches[0].white).points, 1);
  assert.equal(rows.get(current.matches[0].black).points, 0);
  assert.equal(rows.get(current.matches[1].white).points, .5);
  assert.equal(rows.get(current.matches[1].black).points, .5);
  assert.equal(rows.get(current.bye).points, 1);
  assert.equal(rows.get(current.bye).wins, 0);
  assert.equal(rows.get(current.bye).byes, 1);
  assert.deepEqual([0, .5, 1, 1.5, 4.5].map(formatPoints), ["0", "½", "1", "1½", "4½"]);
});

function minimumRepeats(ids, met) {
  if (!ids.length) return 0;
  let best = Infinity;
  for (let j = 1; j < ids.length; j++) {
    best = Math.min(best, Number(met.has(key(ids[0], ids[j]))) + minimumRepeats(ids.slice(1).filter((_, i) => i !== j - 1), met));
  }
  return best;
}

test("fresh-opponent matching is optimal against an exhaustive reference", () => {
  for (const n of [4, 6, 8, 10]) {
    for (let seed = 0; seed < 8; seed++) {
      const random = seeded(seed);
      let tournament = startTournament(roster(n), random);
      for (let turn = 0; turn < n + 2; turn++) {
        for (let i = 0; i < n / 2; i++) tournament = setResult(tournament, i, "draw");
        const met = new Set(tournament.rounds.flatMap((r) => r.matches.map((m) => key(m.white, m.black))));
        const next = nextRound(tournament, random);
        const repeats = next.matches.filter((m) => met.has(key(m.white, m.black))).length;
        assert.equal(repeats, minimumRepeats(tournament.players.map((p) => p.id), met));
        tournament = { ...tournament, rounds: [...tournament.rounds, next] };
      }
    }
  }
});

test("cumulative points have no effect on pair selection", () => {
  const random = seeded();
  let tournament = finish(startTournament(roster(12), random), random);
  tournament = { ...tournament, rounds: [...tournament.rounds, nextRound(tournament, random)] };
  tournament = finish(tournament, random);
  const changed = { ...tournament, rounds: tournament.rounds.map((r, i) => i === 0 ? { ...r, matches: r.matches.map((m) => ({ ...m, result: "draw" })) } : r) };
  assert.notDeepEqual(standings(tournament), standings(changed));
  assert.deepEqual(nextRound(tournament, seeded(10)), nextRound(changed, seeded(10)));
});

test("undo restores previous results and the same bye queue position", () => {
  let tournament = finish(startTournament(roster(5), seeded()));
  const first = tournament;
  tournament = { ...tournament, rounds: [...tournament.rounds, nextRound(tournament)] };
  const bye = tournament.rounds.at(-1).bye;
  assert.deepEqual(undoRound(tournament), first);
  assert.equal(nextRound(undoRound(tournament)).bye, bye);
  assert.deepEqual(undoRound(first), { ...emptyTournament(), draft: first.draft });
});

test("malformed and inconsistent saved state is rejected", () => {
  const tournament = startTournament(roster(5), seeded());
  assert.deepEqual(restoreTournament(JSON.stringify(tournament)), tournament);
  for (const raw of ["{", "null", "{}", JSON.stringify({ ...tournament, version: 2 }), JSON.stringify({ ...tournament, byeOrder: [] }), JSON.stringify({ ...tournament, rounds: [{ matches: [], bye: null }] })]) {
    assert.throws(() => restoreTournament(raw));
  }
  const bad = structuredClone(tournament);
  bad.rounds[0].matches[0].black = bad.rounds[0].matches[0].white;
  assert.throws(() => restoreTournament(JSON.stringify(bad)));
});

test("200-player tournaments remain complete and practical", () => {
  const random = seeded();
  let tournament = startTournament(roster(200), random);
  for (let i = 0; i < 5; i++) {
    tournament = finish(tournament, random);
    const next = nextRound(tournament, random);
    assert.equal(next.matches.length, 100);
    assert.equal(new Set(next.matches.flatMap((m) => [m.white, m.black])).size, 200);
    tournament = { ...tournament, rounds: [...tournament.rounds, next] };
  }
});
