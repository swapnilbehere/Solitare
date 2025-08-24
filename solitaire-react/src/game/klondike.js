export const SUITS = ["S", "H", "D", "C"]; // ♠ ♥ ♦ ♣
export const RANKS = Array.from({ length: 13 }, (_, i) => i + 1); // 1..13

export function isRed(suit) {
  return suit === "H" || suit === "D";
}

export function canStackOnTableau(bottomCard, targetTop) {
  // Allow placing a King on empty tableau
  if (!targetTop) return bottomCard.rank === 13;
  // Alternating color and descending rank
  return isRed(bottomCard.suit) !== isRed(targetTop.suit) && bottomCard.rank === targetTop.rank - 1;
}

export function canMoveToFoundation(card, foundation) {
  if (!card) return false;
  if (foundation.length === 0) return card.rank === 1; // Ace
  const top = foundation[foundation.length - 1];
  return top.suit === card.suit && card.rank === top.rank + 1;
}

export function deepCloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function localDeal(seed) {
  // Deterministic w/ seed via xorshift32 for offline play
  let x = seed ? seed.split("").reduce((a, c) => (a ^ c.charCodeAt(0)) >>> 0, 2463534242) : Math.floor(Math.random() * 2**31);
  function rnd() {
    // xorshift32
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return x / 0xffffffff;
  }
  // Build deck
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ id: `${s}${r}-${Math.random().toString(16).slice(2,8)}`, suit: s, rank: r, faceUp: false });
    }
  }
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  // Deal
  const tableaus = Array.from({ length: 7 }, () => []);
  let idx = 0;
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j <= i; j++) {
      const c = { ...deck[idx++] };
      if (j === i) c.faceUp = true;
      tableaus[i].push(c);
    }
  }
  const stock = deck.slice(idx);
  return { stock, waste: [], foundations: { S: [], H: [], D: [], C: [] }, tableaus };
}