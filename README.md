# Comic Book Studio

End-to-end comic book studio: give a theme → get a cast of characters (with personalities) you can modify and add to → generate a multi-part comic where characters stay **visually consistent** across panels and each part **continues the story** from the previous one.

## Architecture

- **Backend** — FastAPI + MongoDB (Motor), port **8004**. Modular `app/` (routers / services / prompts).
- **Frontend** — React (CRA + Craco), Zustand, Tailwind/Shadcn, port **3002**.
- **AI** — Gemini 2.5 Flash Image (panel art via reference-image conditioning) + an LLM (Gemini / Claude / GPT-4o, configurable) for story & script.
- **Consistency** — each character has a locked reference image fed into every panel generation, plus a textual appearance anchor + a series-level style anchor.
- **Lettering** — speech bubbles/captions are an editable overlay layer, never baked into the AI art; flattened only at export.

## Quick start

### Backend
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env   # then fill in keys
uvicorn app.main:app --reload --port 8004
```

### Frontend
```bash
cd frontend
yarn install
yarn start   # http://localhost:3002
```

## Status
Built in phases (see plan). Phase 0: scaffold + AI plumbing. Phase 1: Series & Character Studio. Phase 2: Story engine. Phase 3: Panel art. Phase 4: Lettering & pages. Phase 5: Reader & export.
