import React, { useEffect, useMemo, useRef, useState } from "react";
import { SUITS, canStackOnTableau, canMoveToFoundation, deepCloneState, localDeal } from "./game/klondike";

const API = "http://localhost:8000";


function Card({ card, selectable, selected, onClick, onDoubleClick, onPointerDown }) {

  const face = card.faceUp;
  const rankName = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][card.rank - 1];
  const suitGlyph = { S: "♠", H: "♥", D: "♦", C: "♣" }[card.suit];
  const color = card.suit === "H" || card.suit === "D" ? "#d22" : "#111";
  return (
    <div
      className={`card ${face ? "up" : "down"} ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      title={face ? `${rankName}${suitGlyph}` : "Face Down"}
    >
      {face ? (
        <>
          <div className="corner tl" style={{ color }}>{rankName}<br />{suitGlyph}</div>
          <div className="center" style={{ color }}>{suitGlyph}</div>
          <div className="corner br" style={{ color }}>{rankName}<br />{suitGlyph}</div>
        </>
      ) : (
        <div className="back" />
      )}
    </div>
  );
}

export default function App() {
  const [game, setGame] = useState(null);
  const [seed, setSeed] = useState("");
  const [selected, setSelected] = useState(null); // { from: 'waste'|'tableau'|'foundation', pile?: number, index?: number, suit?: 'S'|'H'|'D'|'C' }

  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [won, setWon] = useState(false);
  const [message, setMessage] = useState("");
  const undoStack = useRef([]);
  // ---- adaptive pile spacing ----
const CARD_HEIGHT = 150;      // roughly your card height (px)
const BASE_GAP_UP = 26;       // face-up overlap (default)
const BASE_GAP_DOWN = 16;     // face-down overlap (default)
const MIN_GAP_UP = 16;        // minimum face-up gap when compressing
const MIN_GAP_DOWN = 8;       // minimum face-down gap when compressing

function computeGapsForPile(pile) {
  const down = pile.filter(c => !c.faceUp).length;
  const up = pile.length - down;

  // natural overlaps
  const naturalStack = BASE_GAP_DOWN * down + BASE_GAP_UP * up;

  // give each tableau about ~68% of viewport height (room for HUD/footer)
  const targetMax = Math.floor(window.innerHeight * 0.68);

  // full pile height if not overlapping at all
  const naturalHeight = naturalStack + CARD_HEIGHT;

  if (naturalHeight <= targetMax) {
    return { up: BASE_GAP_UP, down: BASE_GAP_DOWN };
  }

  // compress proportionally, but clamp to minimums
  const availableOverlap = Math.max(0, targetMax - CARD_HEIGHT);
  const scale = availableOverlap / Math.max(1, naturalStack);

  const upGap = Math.max(MIN_GAP_UP, Math.floor(BASE_GAP_UP * scale));
  const downGap = Math.max(MIN_GAP_DOWN, Math.floor(BASE_GAP_DOWN * scale));
  return { up: upGap, down: downGap };
}


  // Timer
  useEffect(() => {
    const t = setInterval(() => setSeconds(s => (game && !won ? s + 1 : s)), 1000);
    return () => clearInterval(t);
  }, [game, won]);
  function pickBestTableauTarget(card, state) {
  // Return pile index or null
  let candidates = [];

  for (let i = 0; i < state.tableaus.length; i++) {
    const pile = state.tableaus[i];
    const top = pile[pile.length - 1];
    if (canStackOnTableau(card, top)) {
      candidates.push({
        i,
        isEmpty: pile.length === 0,
        height: pile.length,
        topRank: top ? top.rank : 14, // empty acts like 14 so Kings match it
      });
    }
  }

  if (candidates.length === 0) return null;

  // If King, prefer empty piles first
  if (card.rank === 13) {
    candidates.sort((a, b) => (b.isEmpty - a.isEmpty) || a.height - b.height);
    return candidates[0].i;
  }

  // Otherwise prefer non-empty piles whose top is exactly one higher,
  // tie-break to the shortest pile
  candidates.sort((a, b) => {
    const aExact = a.topRank === card.rank + 1;
    const bExact = b.topRank === card.rank + 1;
    if (aExact !== bExact) return aExact ? -1 : 1;
    // prefer non-empty
    if (a.isEmpty !== b.isEmpty) return a.isEmpty ? 1 : -1;
    // then shortest stack
    return a.height - b.height;
  });

  return candidates[0].i;
}
// --- Drag state ---
const [drag, setDrag] = useState(null); 
// drag = { origin:{from:'waste'|'tableau'|'foundation', pile?, index?, suit?},
//          cards:[...], pointerId, x,y, offsetX,offsetY }

const [dropHints, setDropHints] = useState({ tableaus: new Set(), foundations: new Set() });

// Refs to measure drop targets
const tableauRefs = useRef(Array.from({ length: 7 }, () => React.createRef()));
const foundationRefs = useRef({ S: React.createRef(), H: React.createRef(), D: React.createRef(), C: React.createRef() });


  // New game (try API, else local)
  async function newGame(useSeed) {
    setWon(false); setMoves(0); setSeconds(0); setSelected(null); setMessage("");
    try {
      const url = useSeed ? `${API}/api/new-game?seed=${encodeURIComponent(useSeed)}` : `${API}/api/new-game`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("No API");
      const data = await r.json();
      setSeed(data.seed || "");
      setGame(data.state);
    } catch (e) {
      const s = useSeed || (Math.random().toString(36).slice(2));
      setSeed(s);
      setGame(localDeal(s));
      setMessage("Playing offline (local deal)");
    }
  }
  useEffect(() => { newGame(); }, []);

  // Helpers
  function pushUndo() { undoStack.current.push({ game: deepCloneState(game), moves, seconds }); }
  function popUndo() {
    const prev = undoStack.current.pop();
    if (prev) { setGame(prev.game); setMoves(prev.moves); setSeconds(prev.seconds); setSelected(null); }
  }

  function recycleWasteToStock(state) {
    if (state.stock.length === 0 && state.waste.length) {
      // Flip waste back to stock (all face-down, reverse order)
      state.stock = state.waste.map(c => ({ ...c, faceUp: false })).reverse();
      state.waste = [];
    }
  }
  function computeDropHints(movingStack, state) {
  const hints = { tableaus: new Set(), foundations: new Set() };
  if (!movingStack.length) return hints;
  const bottom = movingStack[0];

  // Tableaus
  for (let i = 0; i < state.tableaus.length; i++) {
    const top = state.tableaus[i][state.tableaus[i].length - 1];
    if (canStackOnTableau(bottom, top)) hints.tableaus.add(i);
  }

  // Foundations: only for single-card moves
  if (movingStack.length === 1) {
    const f = state.foundations[bottom.suit];
    if (canMoveToFoundation(bottom, f)) hints.foundations.add(bottom.suit);
  }
  return hints;
}
function beginDrag(e, origin, pileIndex, cardIndexOrSuit) {
  if (!game || won) return;
  e.stopPropagation();

  const st = deepCloneState(game);
  let movingStack = [];

  if (origin === "waste") {
    const c = st.waste.at(-1);
    if (!c?.faceUp) return;
    movingStack = [c];
  } else if (origin === "tableau") {
    const pile = st.tableaus[pileIndex];
    const ci = cardIndexOrSuit;
    const c = pile[ci];
    if (!c?.faceUp) return;
    movingStack = pile.slice(ci); // drag whole run
  } else if (origin === "foundation") {
    const suit = cardIndexOrSuit;          // here param is the suit key
    const f = st.foundations[suit];
    if (!f.length) return;
    const c = f[f.length - 1];
    if (!c?.faceUp) return;
    movingStack = [c]; // only top card
  }

  if (!movingStack.length) return;

  // where the pointer grabbed the top card
  const rect = e.currentTarget.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;

  const hints = computeDropHints(movingStack, st);
  setDropHints(hints);
  setDrag({
    origin:
      origin === "tableau"
        ? { from: "tableau", pile: pileIndex, index: cardIndexOrSuit }
        : origin === "waste"
        ? { from: "waste" }
        : { from: "foundation", suit: cardIndexOrSuit },
    cards: movingStack,
    pointerId: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    offsetX,
    offsetY,
  });

  // capture pointer so we keep receiving move/up
  e.currentTarget.setPointerCapture?.(e.pointerId);
}

function onPointerMove(e) {
  if (!drag) return;
  setDrag(d => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
}

function endDrag(e) {
  if (!drag) return;
  e.stopPropagation();
  const st = deepCloneState(game);
  const { origin, cards } = drag;
  const bottom = cards[0];

  // Helper: remove from origin
  function removeFromOrigin() {
    if (origin.from === "waste") st.waste.pop();
    else if (origin.from === "tableau") {
      st.tableaus[origin.pile] = st.tableaus[origin.pile].slice(0, origin.index);
      tryAutoFlip(st.tableaus[origin.pile]);
    } else if (origin.from === "foundation") {
      st.foundations[origin.suit].pop();
    }
  }

  // Hit-test foundations (only if single card & legal by suit)
  if (cards.length === 1) {
    for (const suit of SUITS) {
      const ref = foundationRefs.current[suit];
      const r = ref.current?.getBoundingClientRect();
      if (!r) continue;
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside && dropHints.foundations.has(suit) && suit === bottom.suit) {
        pushUndo();
        removeFromOrigin();
        st.foundations[suit].push(bottom);
        setGame(st); setMoves(m => m + 1); tryWin(st);
        setDrag(null); setDropHints({ tableaus: new Set(), foundations: new Set() }); setSelected(null);
        return;
      }
    }
  }

  // Hit-test tableaus
  for (let i = 0; i < 7; i++) {
    const ref = tableauRefs.current[i];
    const r = ref.current?.getBoundingClientRect();
    if (!r) continue;
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const top = st.tableaus[i][st.tableaus[i].length - 1];
    if (inside && canStackOnTableau(bottom, top)) {
      pushUndo();
      removeFromOrigin();
      st.tableaus[i] = [...st.tableaus[i], ...cards];
      setGame(st); setMoves(m => m + 1); tryWin(st);
      setDrag(null); setDropHints({ tableaus: new Set(), foundations: new Set() }); setSelected(null);
      return;
    }
  }

  // No valid drop → cancel
  setDrag(null);
  setDropHints({ tableaus: new Set(), foundations: new Set() });
}
useEffect(() => {
  if (!drag) return;
  function mm(e) { onPointerMove(e); }
  function mu(e) { endDrag(e); }
  window.addEventListener("pointermove", mm, { passive: false });
  window.addEventListener("pointerup", mu, true);
  document.body.style.userSelect = "none";
  return () => {
    window.removeEventListener("pointermove", mm);
    window.removeEventListener("pointerup", mu, true);
    document.body.style.userSelect = "";
  };
}, [drag]);


  function onStockClick() {
    if (!game || won) return;
    const st = deepCloneState(game);
    if (st.stock.length) {
      const card = st.stock.pop();
      card.faceUp = true;
      st.waste.push(card);
    } else {
      recycleWasteToStock(st);
    }
    pushUndo();
    setGame(st); setMoves(m => m + 1);
  }

  function tryAutoFlip(pile) {
    // Flip top face-down card when revealed
    if (pile.length && !pile[pile.length - 1].faceUp) {
      pile[pile.length - 1].faceUp = true;
    }
  }

  function tryWin(state) {
    const total = Object.values(state.foundations).reduce((a, f) => a + f.length, 0);
    if (total === 52) {
      setWon(true);
      setMessage("You win! 🎉");
      // best-effort save
      fetch(`${API}/api/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moves, seconds, won: true, seed }),
      }).catch(() => {});
    }
  }

  function selectFromWaste() {
    if (game.waste.length === 0) return;
    setSelected({ from: "waste", index: game.waste.length - 1 });
  }

  function selectFromTableau(pileIndex, cardIndex) {
    const card = game.tableaus[pileIndex][cardIndex];
    if (!card.faceUp) return; // can't pick face-down
    setSelected({ from: "tableau", pile: pileIndex, index: cardIndex });
  }
  function onFoundationClick(suit) {
  // If something is selected, try to move it to this foundation (existing rule path)
  if (selected) {
    moveToFoundation(suit);
    return;
  }
  // Otherwise select the top card of this foundation (if any)
  const pile = game.foundations[suit];
  if (pile.length === 0) return;
  setSelected({ from: 'foundation', suit, index: pile.length - 1 });
}

  function moveToFoundation(suitKey) {
    if (!selected) return;

    const st = deepCloneState(game);

    let moving = null;
    if (selected.from === "waste") {
      moving = st.waste[st.waste.length - 1];
    } else if (selected.from === "tableau") {
      // only single card to foundation
      moving = st.tableaus[selected.pile][selected.index];
      if (!moving.faceUp) return;
      // must be top card
      if (selected.index !== st.tableaus[selected.pile].length - 1) return;
    }

    if (!moving) return;
    const dest = st.foundations[suitKey];
    if (!canMoveToFoundation(moving, dest)) return;

    pushUndo();
    // remove from origin
    if (selected.from === "waste") st.waste.pop();
    else st.tableaus[selected.pile].pop();

    dest.push(moving);
    if (selected.from === "tableau") tryAutoFlip(st.tableaus[selected.pile]);

    setSelected(null);
    setGame(st); setMoves(m => m + 1);
    tryWin(st);
  }

  function moveToTableau(targetPileIndex) {
    if (!selected) return;
    const st = deepCloneState(game);
    const destPile = st.tableaus[targetPileIndex];

    let movingStack = [];
    if (selected.from === "waste") {
      movingStack = [st.waste[st.waste.length - 1]];
      } else if (selected.from === "foundation") {
        const f = st.foundations[selected.suit];
        if (!f.length) return;
        movingStack = [f[f.length - 1]];
    } else {
      movingStack = st.tableaus[selected.pile].slice(selected.index);
    }

    const bottom = movingStack[0];
    const targetTop = destPile[destPile.length - 1];

    if (!bottom.faceUp) return;
    if (!canStackOnTableau(bottom, targetTop)) return;

    pushUndo();
    // remove from origin
    if (selected.from === "waste") {
      st.waste.pop();
    } else if (selected.from === "foundation") {
      st.foundations[selected.suit].pop();
    } else {
      st.tableaus[selected.pile] = st.tableaus[selected.pile].slice(0, selected.index);
      tryAutoFlip(st.tableaus[selected.pile]);
    }

    st.tableaus[targetPileIndex] = [...destPile, ...movingStack];
    setSelected(null);
    setGame(st); setMoves(m => m + 1);
    tryWin(st);
  }
function tryAutoMoveOnce(state) {
  // 1) Waste → Foundation
  const w = state.waste[state.waste.length - 1];
  if (w && canMoveToFoundation(w, state.foundations[w.suit])) {
    state.waste.pop();
    state.foundations[w.suit].push({ ...w });
    return { moved: true, from: "waste" };
  }

  // 2) Any Tableau top → Foundation (left to right)
  for (let i = 0; i < state.tableaus.length; i++) {
    const pile = state.tableaus[i];
    if (!pile.length) continue;
    const top = pile[pile.length - 1];
    if (top.faceUp && canMoveToFoundation(top, state.foundations[top.suit])) {
      pile.pop();
      state.foundations[top.suit].push({ ...top });
      // flip next card if needed
      if (pile.length && !pile[pile.length - 1].faceUp) {
        pile[pile.length - 1].faceUp = true;
      }
      return { moved: true, from: "tableau", pileIndex: i };
    }
  }

  return { moved: false };
}
function onAutoComplete() {
  if (!game || won) return;
  pushUndo();
  const { state, moves: add } = runAutoComplete(game);
  if (add > 0) {
    setGame(state);
    setMoves(m => m + add);
    tryWin(state);
  }
}

// optional keyboard shortcut: 'A' to auto-complete
useEffect(() => {
  function onKey(e) {
    if ((e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      onAutoComplete();
    }
  }
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [game, won]);

function runAutoComplete(currentState) {
  const st = deepCloneState(currentState);
  let moves = 0;
  while (true) {
    const res = tryAutoMoveOnce(st);
    if (!res.moved) break;
    moves += 1;
  }
  return { state: st, moves };
}

function onCardDoubleClick(origin, pileIndex, cardIndex) {
  if (!game) return;

  const st = deepCloneState(game);
  let movingStack = [];

 if (origin === "waste") {
    const card = st.waste.at(-1);
    if (!card?.faceUp) return;
    movingStack = [card];
  } else if (origin === "tableau") {
    const pile = st.tableaus[pileIndex];
    const card = pile[cardIndex];
    if (!card?.faceUp) return;
    movingStack = pile.slice(cardIndex);
 } else if (origin === "foundation") {
   const f = st.foundations[pileIndex]; // here `pileIndex` will be the *suit* key
   if (!f.length) return;
   const card = f[f.length - 1];
   if (!card?.faceUp) return;
   movingStack = [card]; // foundations only move one card
  }

  if (movingStack.length === 0) return;

  // 1) Try foundation (only single card)
  if (movingStack.length === 1) {
    const card = movingStack[0];
    const f = st.foundations[card.suit];
    if (canMoveToFoundation(card, f) && origin !== "foundation") {  // don't re-send from foundation to foundation
      pushUndo();
      if (origin === "waste") st.waste.pop();
     else if (origin === "tableau") {
        st.tableaus[pileIndex] = st.tableaus[pileIndex].slice(0, cardIndex);
        tryAutoFlip(st.tableaus[pileIndex]);
      }
      f.push(card);
      setGame(st); setMoves(m => m + 1); tryWin(st);
      setSelected(null);
      return;
    }
  }

 // 2) Otherwise try best tableau destination
  const bottom = movingStack[0];
  const destIndex = pickBestTableauTarget(bottom, st);

  if (destIndex !== null) {
    pushUndo();
    if (origin === "waste") {
      st.waste.pop();
   } else if (origin === "tableau") {
      st.tableaus[pileIndex] = st.tableaus[pileIndex].slice(0, cardIndex);
      tryAutoFlip(st.tableaus[pileIndex]);
   } else if (origin === "foundation") {
     st.foundations[pileIndex].pop();
    }
    st.tableaus[destIndex] = [...st.tableaus[destIndex], ...movingStack];
    setGame(st); setMoves(m => m + 1); tryWin(st);
    setSelected(null);
  }
}



  const legalTargets = useMemo(() => {
    // Highlight tableau piles where current selection is legal
    if (!selected || !game) return new Set();
    const set = new Set();
    let moving = null;
    if (selected.from === "waste") {
      moving = game.waste.at(-1);
    } else if (selected.from === "foundation") {
      const f = game.foundations[selected.suit];
      moving = f[f.length - 1];
    } else {
      moving = game.tableaus[selected.pile][selected.index];
    }
    if (!moving?.faceUp) return set;
    for (let i = 0; i < 7; i++) {
      const top = game.tableaus[i][game.tableaus[i].length - 1];
      if (canStackOnTableau(moving, top)) set.add(i);
    }
    return set;
  }, [selected, game]);

  if (!game) return <div className="page"><h2>Loading…</h2></div>;

  return (
    <div className="page">
      <header className="hud">
        <div className="left">
          <button onClick={() => newGame()}>New Game</button>
          <button onClick={() => newGame(seed || undefined)}>New (Seed)</button>
          <button onClick={() => popUndo()} disabled={!undoStack.current.length}>Undo</button>
          <button onClick={onAutoComplete}>Auto</button>

        </div>
        <div className="mid">
          <span>Moves: <b>{moves}</b></span>
          <span>Time: <b>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2, '0')}</b></span>
          {message && <span className="msg">{message}</span>}
        </div>
        <div className="right">
        </div>
      </header>

      <section className="row top-row">
        {/* Stock */}
        <div className="pile stock" onClick={onStockClick}>
          <div className="stack">
            {game.stock.length ? <div className="card down" /> : <div className="placeholder">↺</div>}
          </div>
          <div className="label">Stock</div>
        </div>

        {/* Waste */}
        <div className="pile waste" onClick={selectFromWaste}>
          <div className="stack">
            {game.waste.length ? (
              <Card
                card={game.waste[game.waste.length - 1]}
                selectable
                selected={selected?.from === "waste"}
                onClick={selectFromWaste}
                onDoubleClick={(e) => { e.stopPropagation(); onCardDoubleClick("waste"); }}
                onPointerDown={(e) => beginDrag(e, "waste")}
              />
            ) : <div className="placeholder" />}
          </div>
          <div className="label">Waste</div>
        </div>

        <div className="spacer" />

        {/* Foundations */}
        {SUITS.map((suit) => (
          <div key={suit} className={`pile foundation ${drag && dropHints.foundations.has(suit) ? "legal" : ""}`} onClick={() => onFoundationClick(suit)} >
            <div className="stack" ref={foundationRefs.current[suit]}>
              {game.foundations[suit].length ? (
                <Card card={game.foundations[suit][game.foundations[suit].length - 1]} selected={selected?.from === 'foundation' && selected.suit === suit}
                onDoubleClick={(e) => { e.stopPropagation(); onCardDoubleClick('foundation', suit); }}
                onPointerDown={(e) => beginDrag(e, "foundation", undefined, suit)}
 />
              ) : (
                <div className="placeholder">{({S:"♠",H:"♥",D:"♦",C:"♣"})[suit]}</div>
              )}
            </div>
            <div className="label">Foundation</div>
          </div>
        ))}
      </section>

      {/* Tableaus */}
      <section className="row tableaus">
        {game.tableaus.map((pile, pi) => {
    const gaps = computeGapsForPile(pile);

    // Precompute top positions and overall height
    const positions = [];
    let y = 0;
    for (let i = 0; i < pile.length; i++) {
      positions.push(y);
      y += pile[i].faceUp ? gaps.up : gaps.down;
    }
    const naturalHeight = y + CARD_HEIGHT;
    const maxHeight = Math.floor(window.innerHeight * 0.68);
    const pileHeight = Math.min(naturalHeight, maxHeight);
    const needsScroll = naturalHeight > maxHeight;

    return (
      <div
        key={pi}
        className={`pile tableau ${
          (selected && legalTargets.has(pi)) || (drag && dropHints.tableaus.has(pi)) ? "legal" : ""
        }`}
        onClick={() => moveToTableau(pi)}
      >
        <div
          className="stack tall"
          ref={tableauRefs.current[pi]}
          style={{
            position: "relative",
            height: pileHeight,              // 👈 critical: parent now has height
            overflowY: needsScroll ? "auto" : "visible",
          }}
        >
          {pile.length === 0 && <div className="placeholder">K</div>}
          {pile.map((card, ci) => (
            <div
              key={card.id}
              style={{
                position: "absolute",
                top: positions[ci],            // 👈 use precomputed top
                left: 0,
                zIndex: ci
              }}
            >
              <Card
                card={card}
                selectable={card.faceUp}
                selected={selected?.from === 'tableau' && selected.pile === pi && selected.index === ci}
                onClick={(e) => { e.stopPropagation(); selectFromTableau(pi, ci); }}
                onDoubleClick={(e) => { e.stopPropagation(); onCardDoubleClick('tableau', pi, ci); }}
                onPointerDown={(e) => beginDrag(e, "tableau", pi, ci)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  })}
</section>

      {drag && (
  <div
    className="drag-layer"
    style={{
      left: drag.x - drag.offsetX,
      top: drag.y - drag.offsetY,
      position: "fixed",
      pointerEvents: "none",
      zIndex: 9999,
    }}
  >
    {(() => {
      // Use face-up spacing for the ghost (all cards in a dragged run are face-up)
      const gap = BASE_GAP_UP;
      let ghostTop = 0;
      return drag.cards.map((c, i) => {
        const t = ghostTop;
        ghostTop += gap;
        return (
          <div key={c.id} style={{ position: "absolute", top: t, left: 0 }}>
            <Card card={c} />
          </div>
        );
      });
    })()}
  </div>
)}


      <footer className="footer">
        <small>Klondike Solitaire · React + Python · MIT License</small>
      </footer>
    </div>
  );
}