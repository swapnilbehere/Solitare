from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import random, sqlite3, os, time, uuid

DB_PATH = os.environ.get("SOLITAIRE_DB", "solitaire_scores.db")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUITS = ["S", "H", "D", "C"]  # Spades, Hearts, Diamonds, Clubs
RANKS = list(range(1, 14))         # 1(A) .. 13(K)

# ---------- SQLite bootstrap ----------
conn = sqlite3.connect(DB_PATH, check_same_thread=False)
cur = conn.cursor()
cur.execute(
    """
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player TEXT,
      seed TEXT,
      moves INTEGER,
      seconds INTEGER,
      won INTEGER,
      created_at INTEGER
    )
    """
)
conn.commit()

# ---------- Models ----------
class ScoreIn(BaseModel):
    player: Optional[str] = None
    seed: Optional[str] = None
    moves: int
    seconds: int
    won: bool

# ---------- Helpers ----------

def new_deck(seed: Optional[str] = None):
    rng = random.Random(seed or time.time_ns())
    deck = []
    for s in SUITS:
        for r in RANKS:
            deck.append({
                "id": f"{s}{r}-{uuid.uuid4().hex[:6]}",
                "suit": s,
                "rank": r,
                "faceUp": False,
            })
    rng.shuffle(deck)
    return deck


def deal_klondike(deck: List[dict]):
    # 7 tableau piles: 1..7 cards, last one face up
    tableaus = [[] for _ in range(7)]
    idx = 0
    for i in range(7):
        for j in range(i + 1):
            card = deck[idx]
            idx += 1
            # last card of each pile is face up
            card = card.copy()
            if j == i:
                card["faceUp"] = True
            tableaus[i].append(card)
    stock = [c.copy() for c in deck[idx:]]  # all faceDown by default
    return {
        "stock": stock,
        "waste": [],
        "foundations": {"S": [], "H": [], "D": [], "C": []},
        "tableaus": tableaus,
    }

# ---------- Routes ----------

@app.get("/api/health")
def health():
    return {"ok": True}

@app.get("/api/new-game")
def new_game(seed: Optional[str] = None):
    # If a seed is provided, generate a deterministic deck (nice for challenges)
    deck = new_deck(seed)
    state = deal_klondike(deck)
    return {"seed": seed, "state": state}

@app.post("/api/score")
def post_score(s: ScoreIn):
    cur.execute(
        "INSERT INTO scores (player, seed, moves, seconds, won, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (
            s.player, s.seed, s.moves, s.seconds, 1 if s.won else 0, int(time.time())
        ),
    )
    conn.commit()
    return {"ok": True}

@app.get("/api/scores")
def top_scores():
    # Order: won desc, seconds asc, moves asc, created_at asc
    cur.execute(
        "SELECT player, seed, moves, seconds, won, created_at FROM scores ORDER BY won DESC, seconds ASC, moves ASC, created_at ASC LIMIT 10"
    )
    rows = cur.fetchall()
    out = []
    for r in rows:
        out.append({
            "player": r[0],
            "seed": r[1],
            "moves": r[2],
            "seconds": r[3],
            "won": bool(r[4]),
            "created_at": r[5],
        })
    return {"scores": out}