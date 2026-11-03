"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronRight, CircleHelp, RotateCcw, Shuffle, Trophy, Users, X } from "lucide-react";
import {
  emptyTournament, formatPoints, isComplete, nextRound, outcomes, parseNames, restoreTournament,
  setResult, standings, startTournament, STORAGE_KEY, undoRound, validateNames,
  type Result, type Tournament,
} from "@/lib/chess/tournament";

const RESULTS: { value: Result; score: string; label: string }[] = [
  { value: "white", score: "1–0", label: "Победа белых" },
  { value: "draw", score: "½–½", label: "Ничья" },
  { value: "black", score: "0–1", label: "Победа чёрных" },
];
const DEMO = "Александр\nМария\nДмитрий\nАнна\nМихаил\nЕкатерина\nИван\nСофия";

function BoardArt() {
  return <div className="ch-board-scene" aria-hidden="true">
    <div className="ch-board-topline"><span>ХОД ЗА ВАМИ</span><span>♟</span></div>
    <div className="ch-board">
      {Array.from({ length: 64 }, (_, i) => {
        const pieces: Record<number, string> = { 10: "♜", 21: "♟", 27: "♞", 35: "♙", 44: "♘", 52: "♔" };
        return <span key={i} className={(Math.floor(i / 8) + i % 8) % 2 ? "is-dark" : ""}>{pieces[i] && <b className={i < 30 ? "is-black" : "is-white"}>{pieces[i]}</b>}</span>;
      })}
    </div>
    <div className="ch-board-caption"><span>меньше организации</span><span>больше игры <ArrowUpRight size={14} /></span></div>
  </div>;
}

function Rules() {
  return <details className="ch-rules" id="rules">
    <summary><CircleHelp size={17} /> Как работает турнир <span>+</span></summary>
    <div className="ch-rules-content">
      <p><strong>Первый тур — случайный.</strong> В следующих турах победители играют с победителями, проигравшие — с проигравшими, сыгравшие вничью — между собой. Учитывается только исход последнего тура, сумма очков на пары не влияет.</p>
      <p>Внутри групп пары случайные, с минимальным числом повторных встреч. Если в группах остаётся по одному игроку, они играют между собой.</p>
      <p>При нечётном числе участников один пропускает тур и получает 1 очко. Очередь пропусков случайно определяется в начале и повторяется только после того, как каждый пропустит по разу. Для следующей жеребьёвки пропуск считается победой.</p>
      <p>Результаты текущего тура можно менять. Чтобы исправить прошлый тур, отмените все туры после него. При равных очках участники делят место, имена показаны по алфавиту.</p>
      <p>Турнир сохраняется в этом браузере на этом устройстве. В приватном режиме данные могут исчезнуть после закрытия окна.</p>
    </div>
  </details>;
}

export function TournamentApp() {
  const [tournament, setTournament] = useState<Tournament>(emptyTournament);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "error" | "loading">("loading");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [selectedRound, setSelectedRound] = useState(0);
  const [confirmation, setConfirmation] = useState<"reset" | "undo" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const roundHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const restored = restoreTournament(raw);
          setTournament(restored);
          setSelectedRound(Math.max(0, restored.rounds.length - 1));
        } catch {
          setNotice("Не удалось прочитать сохранённый турнир. Можно начать новый — сохранение заменится после ввода данных.");
        }
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmation]);

  function persist(next: Tournament) {
    setTournament(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaveState("saved");
    } catch { setSaveState("error"); }
  }

  function start(event: FormEvent) {
    event.preventDefault();
    const error = validateNames(parseNames(tournament.draft));
    if (error) { setFormError(error); return; }
    persist(startTournament(tournament.draft));
    setSelectedRound(0);
    setFormError("");
    setNotice("");
    requestAnimationFrame(() => roundHeading.current?.focus());
  }

  function advance() {
    if (!current || !isComplete(current)) return;
    const next = { ...tournament, rounds: [...tournament.rounds, nextRound(tournament)] };
    persist(next);
    setSelectedRound(next.rounds.length - 1);
    requestAnimationFrame(() => roundHeading.current?.focus());
  }

  function confirmAction() {
    const next = confirmation === "reset" ? emptyTournament() : undoRound(tournament);
    persist(next);
    setSelectedRound(Math.max(0, next.rounds.length - 1));
    setConfirmation(null);
    setNotice("");
  }

  const active = tournament.rounds.length > 0;
  const roundIndex = Math.min(selectedRound, Math.max(0, tournament.rounds.length - 1));
  const round = tournament.rounds[roundIndex];
  const current = tournament.rounds.at(-1);
  const editable = roundIndex === tournament.rounds.length - 1;
  const completed = current?.matches.filter((match) => match.result !== null).length ?? 0;
  const pending = (current?.matches.length ?? 0) - completed;
  const names = new Map(tournament.players.map((player) => [player.id, player.name]));
  const rows = standings(tournament);
  const lastOutcomes = roundIndex > 0 ? outcomes(tournament.rounds[roundIndex - 1]) : null;
  const totalGames = tournament.rounds.reduce((sum, r) => sum + r.matches.filter((m) => m.result !== null).length, 0);
  const playerCount = parseNames(tournament.draft).length;

  return <div className="chess-app">
    <a href="#ch-main" className="skip-link">к турниру</a>
    <header className="ch-header">
      <div className="ch-wrap ch-header-inner">
        <a className="ch-logo" href="https://kernell.ru">kernell<sup>TM</sup><span>/ chess</span></a>
        <div className="ch-save" role="status">
          <i className={saveState === "error" ? "is-error" : ""} />
          {saveState === "loading" ? "Загрузка…" : saveState === "error" ? "Не сохранено" : "Сохранение в браузере"}
        </div>
        <a className="ch-home-link" href="https://kernell.ru">kernell.ru <ArrowUpRight size={15} /></a>
      </div>
    </header>

    <main id="ch-main" className="ch-wrap">
      {notice && <p className="ch-notice" role="alert">{notice}</p>}
      {saveState === "error" && <p className="ch-notice" role="alert">Браузер не разрешил сохранить данные. Не закрывайте вкладку: изменения доступны только до перезагрузки. Разрешите хранилище для сайта, чтобы включить сохранение.</p>}

      {!active ? <>
        <section className="ch-intro">
          <div>
            <p className="ch-eyebrow"><i /> ШАХМАТЫ. В ХОРОШЕЙ КОМПАНИИ.</p>
            <h1>Ваш турнир.<br /><span>Ваш ход.</span></h1>
            <p className="ch-intro-copy">Соберите игроков — мы подберём пары.<br />Вам остаётся играть и отмечать результаты.</p>
            <div className="ch-intro-meta"><span>Без регистрации</span><span>Всё в одной вкладке</span></div>
          </div>
          <BoardArt />
        </section>
        <section className="ch-setup" aria-labelledby="setup-heading">
          <div className="ch-setup-description">
            <span className="ch-section-number">01 / НАЧАЛО ПАРТИИ</span>
            <h2 id="setup-heading">Кто за доской?</h2>
            <p>Введите или вставьте список участников. Каждое имя — с новой строки.</p>
            <div className="ch-points"><span><b>1</b> победа</span><span><b>½</b> ничья</span><span><b>0</b> поражение</span></div>
            <div className="ch-setup-note"><Shuffle size={20} /><p>Первый тур — случайные пары.<br />Дальше — по результату предыдущего тура.</p></div>
          </div>
          <form className="ch-form" onSubmit={start}>
            <div className="ch-form-label"><label htmlFor="players">Участники</label><span><Users size={14} /> {playerCount}</span></div>
            <textarea id="players" value={tournament.draft} onChange={(e) => { persist({ ...tournament, draft: e.target.value }); setFormError(""); }}
              placeholder={"Александр\nМария\nДмитрий\nАнна"} rows={7} disabled={!ready} aria-describedby="players-help players-error" aria-invalid={!!formError} spellCheck={false} />
            <div className="ch-form-help"><span id="players-help">От 2 до 200 игроков</span><button type="button" className="ch-text-button" disabled={!ready} onClick={() => { persist({ ...tournament, draft: DEMO }); setFormError(""); }}>Вставить пример <ArrowDown size={12} /></button></div>
            <p id="players-error" className="ch-form-error" role="alert">{formError}</p>
            <button className="ch-button ch-primary ch-start" type="submit" disabled={!ready}>Сформировать первый тур <ArrowRight size={19} /></button>
            <p className="ch-local-note">Список и результаты сохранятся в этом браузере.</p>
          </form>
        </section>
      </> : <>
        <section className="ch-tournament-title">
          <div><p className="ch-eyebrow"><i /> ИГРА ПРОДОЛЖАЕТСЯ</p><h1>За доской.</h1></div>
          <div className="ch-tournament-stats"><div><b>{tournament.players.length}</b><span>игроков</span></div><div><b>{tournament.rounds.length}</b><span>туров</span></div><div><b>{totalGames}</b><span>партий сыграно</span></div></div>
        </section>
        <div className="ch-dashboard">
          <section className="ch-round-section" aria-labelledby="round-heading">
            <div className="ch-round-top"><span className="ch-section-number">01 / ПАРТИИ</span><button type="button" className="ch-text-button" onClick={() => setConfirmation("undo")}><RotateCcw size={14} /> Отменить последний тур</button></div>
            <nav className="ch-round-tabs" aria-label="История туров">{tournament.rounds.map((r, i) => <button key={i} type="button" aria-pressed={roundIndex === i} onClick={() => setSelectedRound(i)} className={roundIndex === i ? "is-active" : ""}>Тур {i + 1}{isComplete(r) && <Check size={12} />}</button>)}</nav>
            <div className="ch-round-heading"><h2 ref={roundHeading} tabIndex={-1} id="round-heading">Тур {roundIndex + 1}<span>{editable ? "Текущий" : "Завершён"}</span></h2><p>{editable ? "Отметьте результат каждой партии." : "Результаты сохранены. Для исправления отмените последующие туры."}</p></div>
            <div className="ch-match-list">{round.matches.map((match, index) => {
              const cross = lastOutcomes && lastOutcomes.get(match.white) !== lastOutcomes.get(match.black);
              return <article className={`ch-match ${match.result ? "is-complete" : ""}`} key={`${roundIndex}-${index}`} aria-labelledby={`match-${index}`}>
                <div className="ch-match-meta"><h3 id={`match-${index}`}>Доска {String(index + 1).padStart(2, "0")}</h3><span>{cross ? "Между группами" : roundIndex === 0 ? "Случайная пара" : "Одна группа"}{match.result && <Check size={13} />}</span></div>
                <div className="ch-players"><div className={match.result === "white" ? "is-winner" : ""}><i className="ch-piece is-white" /><span>{names.get(match.white)}</span><small>белые</small></div><span className="ch-vs">vs</span><div className={match.result === "black" ? "is-winner" : ""}><i className="ch-piece is-black" /><span>{names.get(match.black)}</span><small>чёрные</small></div></div>
                <div className="ch-result-options" role="group" aria-label={`Результат: ${names.get(match.white)} — ${names.get(match.black)}`}>{RESULTS.map((result) => <button key={result.value} type="button" aria-pressed={match.result === result.value} disabled={!editable} onClick={() => persist(setResult(tournament, index, match.result === result.value ? null : result.value))} className={match.result === result.value ? "is-selected" : ""}><b>{result.score}</b><span>{result.label}</span>{match.result === result.value && <Check size={13} />}</button>)}</div>
              </article>;
            })}</div>
            {round.bye && <div className="ch-bye"><span className="ch-bye-icon">+1</span><div><strong>{names.get(round.bye)}</strong><p>Пропускает тур. В следующей жеребьёвке — в группе победителей.</p></div><span className="ch-bye-points">1 очко</span></div>}
            {editable ? <div className="ch-next-round"><div className="ch-progress-label" aria-live="polite"><span>{pending === 0 ? "Все результаты введены" : `Результаты: ${completed} из ${current!.matches.length}`}</span><span>{pending === 0 ? <Check size={16} /> : `${Math.round(completed / current!.matches.length * 100)}%`}</span></div><div className="ch-progress" aria-hidden="true"><i style={{ width: `${completed / current!.matches.length * 100}%` }} /></div><button type="button" className="ch-button ch-primary" disabled={pending > 0} onClick={advance}>Сформировать тур {tournament.rounds.length + 1} <ArrowRight size={18} /></button><p>{pending > 0 ? "Следующий тур станет доступен после ввода всех результатов." : "Пары будут подобраны по исходу этого тура."}</p></div>
              : <button className="ch-button ch-return" type="button" onClick={() => setSelectedRound(tournament.rounds.length - 1)}>К текущему туру <ChevronRight size={17} /></button>}
          </section>

          <aside className="ch-standings" aria-labelledby="standings-heading"><div className="ch-standings-head"><span className="ch-section-number">02 / РЕЗУЛЬТАТЫ</span><Trophy size={20} /><h2 id="standings-heading">Таблица очков</h2><p>Все введённые результаты, включая текущий тур.</p></div><div className="ch-table-scroll"><table><caption className="sr-only">Места и суммарные очки игроков. При равенстве очков место общее.</caption><thead><tr><th scope="col">#</th><th scope="col">Игрок</th><th scope="col"><abbr title="Победы / ничьи / поражения">В/Н/П</abbr></th><th scope="col">Очки</th></tr></thead><tbody>{rows.map((row, i) => { const rank = rows.findIndex((other) => other.points === row.points) + 1; return <tr key={row.id} className={rank === 1 && row.points > 0 ? "is-leader" : ""}><td>{rank < 10 ? `0${rank}` : rank}</td><th scope="row">{row.name}{row.byes > 0 && <small title="Пропуски включены в очки">пропусков: {row.byes}</small>}</th><td>{row.wins}/{row.draws}/{row.losses}</td><td>{formatPoints(row.points)}</td></tr>; })}</tbody></table></div><div className="ch-standings-note"><span>1 — победа · ½ — ничья · 0 — поражение</span><p>Очки определяют места в таблице.<br />Пары — только исход последнего тура.</p></div></aside>
        </div>
      </>}

      <Rules />
      {active && <div className="ch-reset-row"><p>Новая компания, новая игра.</p><button type="button" className="ch-text-button" onClick={() => setConfirmation("reset")}><RotateCcw size={14} /> Сбросить турнир</button></div>}
    </main>
    <footer className="ch-footer ch-wrap"><a href="https://kernell.ru">kernell<sup>TM</sup></a><span>Для тех, кто любит думать на ход вперёд.</span><span>chess / 01</span></footer>

    <dialog ref={dialog} className="ch-dialog" onCancel={() => setConfirmation(null)} onClick={(e) => { if (e.target === dialog.current) setConfirmation(null); }} aria-labelledby="confirm-title" aria-describedby="confirm-description">
      <div className="ch-dialog-inner"><button className="ch-dialog-close" type="button" aria-label="Закрыть" onClick={() => setConfirmation(null)}><X size={20} /></button><span className="ch-section-number">{confirmation === "reset" ? "НОВАЯ ИГРА" : "ШАГ НАЗАД"}</span><h2 id="confirm-title">{confirmation === "reset" ? "Сбросить турнир?" : `Отменить тур ${tournament.rounds.length}?`}</h2><p id="confirm-description">{confirmation === "reset" ? "Список игроков, все туры и результаты будут удалены из этого браузера." : tournament.rounds.length > 1 ? `Пары и результаты тура ${tournament.rounds.length} будут удалены. Тур ${tournament.rounds.length - 1} снова станет доступен для исправлений. Его результаты сохранятся.` : "Пары и результаты первого тура будут удалены. Вы вернётесь к списку участников и сможете провести жеребьёвку заново."}</p><div className="ch-dialog-actions"><button type="button" className="ch-button ch-secondary" autoFocus onClick={() => setConfirmation(null)}>Продолжить турнир</button><button type="button" className="ch-button ch-primary" onClick={confirmAction}>{confirmation === "reset" ? "Сбросить" : "Отменить тур"}</button></div></div>
    </dialog>
  </div>;
}
