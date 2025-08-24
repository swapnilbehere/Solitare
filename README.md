# Klondike Solitare (React + FastAPI)

A fast, modern, hackable Solitare you can run locally or deploy.
Built with **React** (frontend) and **FastAPI** (backend) with offline fallback, **drag-and-drop**, undo, smart auto-moves, and adaptive pile stacking.

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#controls--ux">Controls</a> •
  <a href="#project-structure">Structure</a> •
  <a href="#configuration">Config</a> •
  <a href="#troubleshooting">Troubleshooting</a> •
  <a href="#roadmap">Roadmap</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

---

## Features

- ♠ **Klondike rules** (draw-1): foundations, tableau, legal runs, king-to-empty.
- 🖱 **Drag & Drop** via Pointer Events: snap targets + ghost preview + drop hints.
- 🖱 **Double-click**: auto to foundation (if legal) or best tableau target.
- 🤖 **Auto-Complete** (`A`): greedily sends all safe moves to foundations.
- ↩️ **Undo** stack.
- ⏱ **Timer** & **move counter**.
- 🎲 **Seeded deals** (replayable); **offline local deal** if API unreachable.
- 📱 **Responsive** layout + **adaptive stacking** for tall piles (smart overlap).
- ♻️ Waste ↔ Stock recycle; move back **from foundation to tableau** when legal.

> Planned toggles & variants: Draw-3, Vegas scoring, Timed mode, FreeCell/Spider/TriPeaks. See **Roadmap**.

---

## Tech Stack

- **Frontend:** React + Vite, plain CSS (no framework required)
- **Backend:** FastAPI (Python 3.10+)
- **Rules Engine:** `game/klondike.js` (pure helpers: deal, canMove, RNG)
- **Tooling:** ESM, Fetch API, GitHub Actions (CI)

---

## Quick Start

### Backend (FastAPI)

```bash
# from repo root
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000

```

Endpoints:

- `GET /api/new-game` – optional `?seed=abc123`
- `POST /api/score` – `{ moves, seconds, won, seed }`

> If you see **“Could not import module 'app'”**, make sure you run uvicorn from the repo root and reference `backend.app:app`.

### Frontend (React)

```bash
cd Solitare-react
npm install
npm run dev
```

Open: `http://localhost:5173`

The frontend expects the API at `http://localhost:8000`. You can change this at the top of `App.jsx`:

```js
const API = "http://localhost:8000";
```

When the API is not reachable, the UI shows **“Playing offline (local deal)”** and uses a local shuffler.

## Game Rules (Klondike draw-1)

- **Tableau:** build down in alternating colors (red on black, black on red).
- **Empty column:** only **Kings** may be placed.
- **Foundations:** by suit, **A → K** (single-card moves only).
- **Runs:** move descending, alternating-color runs between tableau columns when legal.

---

## Project Structure

```
.
.
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── Solitare_scores.db
├── Solitare-react/
│   ├── src/
│   │   ├── game/
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
└── README.md

```
