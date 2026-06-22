# Comic Book Studio

End-to-end AI comic book studio. Give it a **theme** → get a cast of **characters** (with personalities) you can edit and extend → generate a **multi-part comic** where characters stay **visually consistent** across every panel, and each new part **continues the story** from the one before. Letter it with editable speech bubbles, lay out pages, and publish a public reader or export to PDF.

---

## Table of contents

- [Highlights](#highlights)
- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Running the app](#running-the-app)
- [API overview](#api-overview)
- [Frontend routes](#frontend-routes)
- [Data model](#data-model)
- [Tests](#tests)
- [Roadmap](#roadmap)

---

## Highlights

- **Theme → cast → comic** in one continuous workflow.
- **Visual consistency** — every character has a locked reference portrait that is fed into every panel as a conditioning image, plus a textual *appearance anchor* and a series-level *style anchor* applied to all art.
- **Story continuity** — each part is generated with the previous parts as context, so the narrative carries forward.
- **Editable lettering** — speech bubbles and captions live as an overlay layer and are *never* baked into the AI art; they're flattened only at export.
- **Page layouts** — auto or custom panel grids, composed into finished pages.
- **Publish & export** — a public web reader (shareable slug) and one-click PDF export.
- **Provider-agnostic story engine** — write prose with Gemini, Claude, or GPT-4o via a single config switch.
- **Multi-user ready** — runs single-user with zero login by default; an auth seam lets you flip on real accounts later without rework.

---

## How it works

1. **Series bootstrap** — you provide a theme/premise. The story LLM proposes a series concept, art style, and a starter cast.
2. **Character studio** — edit personalities (traits, motivations, voice), generate a canonical reference portrait per character, then **lock** it. The locked portrait becomes the visual source of truth.
3. **Story engine** — generate a part. The LLM writes the script/beats with prior parts as context, producing panels with dialogue and art directions.
4. **Panel art** — each panel is rendered by Gemini's image model, conditioned on the relevant characters' locked reference images + the appearance/style anchors, so faces and outfits stay on-model.
5. **Lettering & pages** — dialogue is placed as an editable overlay; panels are arranged into page layouts and composed.
6. **Publish / export** — publish a part to the public reader under a slug, or export a print-ready PDF.

The consistency rules are centralized in [`backend/app/services/consistency.py`](backend/app/services/consistency.py) — a global "no text in art" rule, the series style anchor, and per-character appearance anchors + reference images.

---

## Architecture

- **Backend** — FastAPI + MongoDB (Motor async driver), port **8004**. Modular `app/` split into `routers/` (HTTP), `services/` (story, image gen, consistency, compositing, render, jobs), and `prompts/` (LLM prompt templates).
- **Frontend** — React (CRA + Craco), Zustand for state, Tailwind/Shadcn-style UI, port **3002**.
- **AI**
  - *Panel art* — Gemini 2.5 Flash Image, via reference-image conditioning.
  - *Story & script* — pluggable LLM: Gemini 2.5 Flash (default), Claude Sonnet, or GPT-4o.
- **Storage** — local blob store under `backend/storage/` (character refs, covers, panel art, exports) behind a `storage.py` seam, ready to swap for S3/R2.
- **Jobs** — long-running generation runs as background jobs; the frontend polls `/api/jobs/{id}` for status.

---

## Tech stack

| Layer     | Tech |
|-----------|------|
| Backend   | FastAPI, Uvicorn, Pydantic v2, Motor (MongoDB), httpx |
| AI        | `google-genai`, `anthropic`, `openai`, Pillow |
| Frontend  | React 18, React Router 6, Zustand, Axios, Tailwind CSS, lucide-react, sonner |
| Tooling   | Craco, PostCSS, Autoprefixer, pytest |

---

## Project layout

```
comic-studio/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + router wiring + CORS
│   │   ├── config.py          # env-driven config (ports, DB, AI keys, models)
│   │   ├── db.py / repo.py     # Mongo connection + data access
│   │   ├── models.py          # Pydantic request/response models
│   │   ├── security.py        # password hashing / sessions
│   │   ├── deps.py            # auth seam + default user
│   │   ├── routers/           # auth, series, characters, parts, pages, jobs, assets, showcase, dev
│   │   ├── services/          # story, llm, imagegen, consistency, compositor, render, jobs
│   │   └── prompts/           # series_bootstrap, character_design, story_part
│   ├── tests/                 # pytest suite
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/             # Landing, Login, Library, SeriesStudio, PartView, Showcase, PublicReader
│   │   ├── components/        # CharacterEditor, StoryStudio, PanelEditor, PageLayoutEditor, ...
│   │   ├── lib/               # layout + utils
│   │   ├── api.js             # backend client
│   │   └── App.js             # routes
│   └── package.json
└── start.bat                  # Windows launcher (frees ports, starts both servers)
```

---

## Quick start

### Prerequisites

- **Python 3.11+** and **Node 18+** (with Yarn)
- **MongoDB** running locally (`mongodb://127.0.0.1:27017`) or a connection string
- A **Gemini API key** (required for image generation; also the default story provider). Optional: Anthropic / OpenAI keys to switch the story provider.

### Backend

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows
# source .venv/bin/activate                       # macOS/Linux
pip install -r requirements.txt
cp .env.example .env                              # then fill in your keys
uvicorn app.main:app --reload --port 8004
```

Interactive API docs are then served at **http://localhost:8004/docs**.

### Frontend

```bash
cd frontend
cp .env.example .env       # defaults point at http://localhost:8004
yarn install
yarn start                 # http://localhost:3002
```

---

## Configuration

Backend config is read from `backend/.env` (see [`.env.example`](backend/.env.example)). Key settings:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` / `HOST` | `8004` / `0.0.0.0` | Backend bind |
| `FRONTEND_ORIGIN` | `http://localhost:3002` | CORS allow-origin |
| `MONGO_URL` / `DB_NAME` | `mongodb://127.0.0.1:27017` / `comic_studio` | Database |
| `STORAGE_DIR` | `./storage` | Local blob store (resolved against the backend dir) |
| `GEMINI_API_KEY` | — | **Required** for image gen / default story LLM |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | — | Optional, for alternate story providers |
| `STORY_PROVIDER` | `gemini` | Story/script provider: `gemini` \| `anthropic` \| `openai` |
| `GEMINI_IMAGE_MODEL` | `gemini-2.5-flash-image` | Panel art model |
| `GEMINI_TEXT_MODEL` | `gemini-2.5-flash` | Default story model |
| `ANTHROPIC_MODEL` / `OPENAI_MODEL` | `claude-sonnet-4-6` / `gpt-4o` | Alternate story models |
| `SCRIPT_TEMPERATURE` | `0.85` | Story creativity |
| `MAX_RETRIES` | `3` | Generation retry budget (exponential backoff) |
| `IMAGE_COST_USD` | `0.039` | Per-image cost estimate for the usage meter |
| `AUTH_ENABLED` | `false` | `false` = single local user, no login. `true` = email/password accounts |
| `DEFAULT_USER_ID` | `local-user` | Owner of all data in single-user mode |

Frontend config (`frontend/.env`): `REACT_APP_BACKEND_URL` (default `http://localhost:8004`), `PORT` (`3002`).

> **Note:** when `AUTH_ENABLED` is flipped from `false` to `true`, the first account to register adopts any comics created in local mode, so existing work isn't lost.

---

## Running the app

On Windows you can launch both servers at once:

```bat
start.bat
```

It frees ports 8004/3002, opens the backend and frontend in separate windows, and prints the URLs. The first frontend compile takes ~30–60s.

---

## API overview

All endpoints are under `/api`. Highlights (full schema at `/docs`):

**Auth** (`/api/auth`)
- `POST /register`, `POST /login`, `POST /logout`, `GET /me`

**Series** (`/api/series`)
- `POST ""` create · `GET ""` list · `GET /{id}` · `PATCH /{id}` · `DELETE /{id}`
- `POST /{id}/generate-cover`

**Characters** (`/api`)
- `POST /series/{id}/characters` · `GET|PATCH|DELETE /characters/{id}`
- `POST /characters/{id}/generate-portrait` · `set-portrait` · `lock` · `unlock`

**Parts** (`/api`)
- `POST /series/{id}/parts` generate · `GET /series/{id}/parts` · `GET /parts/{id}` · `DELETE /parts/{id}`
- `POST /parts/{id}/publish` · `unpublish`
- `PATCH /panels/{id}` · `POST /panels/{id}/generate-art` · `set-art` · `GET /panels/{id}`

**Pages** (`/api`)
- `POST /pages/{id}/compose` · `layout` · `custom-layout`
- `POST /parts/{id}/compose` · `export-pdf` · `generate-art`

**Jobs / Assets / Showcase / Dev**
- `GET /api/jobs/{id}` — background job status
- `GET /api/assets/{id}` — serve a stored image/PDF
- `GET /api/showcase` · `GET /api/showcase/{slug}` — public gallery + reader
- `GET /api/usage` · `GET /api/health` · `POST /api/dev/test-llm` · `POST /api/dev/test-image`

---

## Frontend routes

| Route | Page | Access |
|-------|------|--------|
| `/` | Landing | public |
| `/login` | Login | public |
| `/showcase` | Public gallery | public |
| `/c/:slug` | Public comic reader | public |
| `/app` | Library (your series) | protected |
| `/series/:id` | Series Studio (characters + parts) | protected |
| `/parts/:partId` | Part view (script, panels, lettering, pages) | protected |

---

## Data model

Domain documents are stored as plain MongoDB documents shaped by the service layer:

- **Series** — premise, art style anchor, owner, cover, publish state.
- **Character** — name, personality (`traits`, `motivations`, `voice`), `appearance_anchor`, reference portrait asset, `locked` flag.
- **Part** — ordered chapter of a series; holds the generated script and panels; can be published under a slug.
- **Panel** — art direction, dialogue, generated art asset, lettering overlay.
- **Page** — a layout (auto or custom grid) composing multiple panels.
- **Asset** — a stored blob (character ref, cover, panel art, export) addressed by id.

---

## Tests

```bash
cd backend
pytest
```

The suite covers a smoke test and series/character flows (`backend/tests/`).

---

## Roadmap

Built in phases:

- **Phase 0** — scaffold + AI plumbing
- **Phase 1** — Series & Character Studio
- **Phase 2** — Story engine (multi-part continuity)
- **Phase 3** — Panel art with character consistency
- **Phase 4** — Lettering & page composition
- **Phase 5** — Public reader & PDF export
- **Phase 7** — Multi-user auth (seam already in place)
