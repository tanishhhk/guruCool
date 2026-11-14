# guruCool

**Upload a PDF. Ask it anything. Watch it explained.**

guruCool turns dense documents into something you can talk to. Drop in a report, a handbook or a set of notes, and get plain-language answers that point to the exact page they came from, or a short narrated video that walks you through the whole thing.

**Try it:** [tanishhhk.github.io/guruCool](https://tanishhhk.github.io/guruCool/)

## What you can do

**Explain it as a video.** Every document opens with a narrated video explanation. Pick the voice and the length, from a quick overview to a detailed walkthrough. The story is ready to read while the video renders.

**Ask questions in a real conversation.** Answers are written in simple words instead of copied sentences, with lists and tables where they help. Every claim carries a page chip that shows the passage it came from. Each document keeps its own chat history, and quick follow-ups such as "Explain it simpler" are one tap away.

**Keep a shelf of documents.** A home screen and a document shelf show what you are working on, ordered by recent activity, with upload and reading progress as each file is prepared.

**Own your account.** Rename yourself, change your password, sign out of every device at once, or delete your account along with every document, chat and video. Sign-in tokens are versioned, so a password change signs out everywhere else.

**Free to use.** Everyone gets a daily allowance of uploads, questions and video stories that resets at midnight UTC.

A short welcome tour shows new users around on their first visit.

## How it works

1. **Upload.** The PDF is stored and queued. A background worker extracts the text page by page in an isolated process with time and memory limits.
2. **Chunk.** Text is split along sentence, heading and table-row boundaries, and every chunk remembers its page range.
3. **Embed.** Each chunk becomes a vector with `all-MiniLM-L6-v2`, running on ONNX Runtime.
4. **Retrieve.** A question is embedded and matched against the document's chunks, then the best matches are re-ranked.
5. **Answer.** The top passages go to the language model as numbered sources, kept separate from the instructions. The model is told to answer only from those sources, to treat them as untrusted data, and to cite them.
6. **Verify.** Any citation that points to a passage that was not retrieved is removed before the answer is returned.

Video stories follow the same path: the model writes a scene-by-scene script from the document, Pillow draws the slides, edge-tts narrates them, and ffmpeg assembles the MP4.

### Built to be trusted

- **Grounded answers.** Every `[S#]` citation maps to a real retrieved passage with page numbers.
- **Never a dead end.** Answers come from whichever of several free model providers responds first. If none can answer, the best matching passages are returned, clearly labelled.
- **Private by default.** Every document, chat and story belongs to one account, and tests check that no other user can reach them.
- **Hardened inputs.** Upload idempotency keys, size and page limits, request limits per route, token revocation, and prompt-injection resistant prompts.
- **Measured retrieval.** On a labelled set of 37 questions, the page-aware chunker reaches 0.939 hit@1, 0.970 hit@3 and 0.985 MRR, and CI fails if quality drops.

## Stack

| Area | Technology |
|---|---|
| Web app | React 19, Vite |
| API | FastAPI, Uvicorn |
| Database | PostgreSQL or SQLite through SQLAlchemy, Alembic migrations |
| Search | fastembed (ONNX Runtime), all-MiniLM-L6-v2, re-ranking |
| Answers | Ollama, OpenRouter, Groq or Gemini, in a fallback chain |
| Video | Pillow, edge-tts, ffmpeg |
| Sign-in | JWT, bcrypt, email codes through Brevo, Google through Firebase |
| Hosting | Render (API and Postgres), GitHub Pages (web app) |
| Quality | pytest, Hypothesis, Vitest, ESLint, Ruff, pip-audit, Gitleaks |

## Run it locally

Python 3.11 and Node 20 or newer are recommended.

```bash
git clone https://github.com/tanishhhk/guruCool.git
cd guruCool

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
```

In `.env`:

- Set `SECRET_KEY` to a random value of at least 32 characters: `python -c "import secrets; print(secrets.token_hex(32))"`.
- Add at least one answer provider (below).
- Keep `CORS_ORIGINS` listing the web app's address.

Start the API and the web app:

```bash
uvicorn app.main:app --reload            # http://localhost:8000, docs at /docs

cd frontend
npm install
npm run dev                              # http://localhost:5173
```

The database is created and migrated on start. The embedding model downloads the first time it is needed.

### Answer providers

Configure one or more. Each request uses the first that works, in `LLM_PROVIDERS` order, and moves on when one is slow, rate limited or out of quota.

| Provider | Setup | Notes |
|---|---|---|
| Ollama | Install [Ollama](https://ollama.com), run `ollama pull qwen3:8b`, set `OLLAMA_MODEL=qwen3:8b` | Runs on your own computer. Documents never leave the machine. |
| OpenRouter | Key from openrouter.ai, set `OPENROUTER_API_KEY` | Free models, several can be listed as fallbacks. |
| Groq | Key from console.groq.com, set `GROQ_API_KEY` | Very fast. |
| Gemini | Key from Google AI Studio, set `GEMINI_API_KEY` | |

Questions send only a few retrieved passages, so models with small context windows work well. For confidential documents, use Ollama.

### Docker

`docker-compose.yml` runs PostgreSQL, a one-off migration, the API and a separate document worker:

```bash
cp .env.example .env   # set SECRET_KEY, POSTGRES_PASSWORD and an answer provider
docker compose up --build
```

The image runs as a non-root user and ships with the embedding model.

## Deploy

guruCool runs entirely on free plans.

- **API:** [Deploy to Render](https://render.com/deploy?repo=https://github.com/tanishhhk/guruCool) from the Blueprint in `render.yaml`. Paste your provider keys when asked; Render generates `SECRET_KEY` and connects the database. Pushes to `main` redeploy.
- **Web app:** run `python scripts/go_live.py https://<service>.onrender.com`. It checks the API, points the web app at it and publishes to GitHub Pages. Pushes to `main` republish.

**Email codes.** Set `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY` and `EMAIL_FROM_ADDRESS` to verify new accounts and reset passwords with 6-digit codes sent through a free [Brevo](https://www.brevo.com) account.

**Google sign-in.** Create a Firebase project, enable the Google provider, add your site's domain to the authorised domains, and set `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY` and `FIREBASE_AUTH_DOMAIN`. The API checks every Firebase token's signature, audience and expiry.

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Database connection | SQLite file |
| `SECRET_KEY` | Token signing key | Required |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Sign-in token lifetime | `30` |
| `LLM_PROVIDERS` | Answer providers to try, in order | `ollama,openrouter,groq,gemini` |
| `LLM_TIMEOUT_SECONDS` | Time limit for one provider call | `20` |
| `ANSWER_FALLBACK` | `extractive` returns matching passages when no provider answers; `none` returns an error | `extractive` |
| `CORS_ORIGINS` | Web app origins allowed to call the API | Local development |
| `DAILY_UPLOADS_PER_USER` | Daily uploads on the free plan | `5` |
| `DAILY_QUESTIONS_PER_USER` | Daily questions on the free plan | `25` |
| `DAILY_STORIES_PER_USER` | Daily video stories on the free plan | `3` |
| `MAX_DOCUMENTS_PER_USER` | Documents on a shelf | `20` |
| `MAX_FILE_SIZE`, `MAX_PDF_PAGES` | Upload limits | 10 MB, 500 pages |
| `VIDEO_RENDER_ENABLED` | Render MP4 videos as well as written stories | `true` |
| `EMAIL_PROVIDER` | `none`, `console` or `brevo` | `none` |
| `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN` | Google sign-in | none |
| `FIREBASE_PHONE_ENABLED` | Phone number sign-in | `false` |
| `AUTO_MIGRATE` | Upgrade the database on start | `true` |
| `INGESTION_WORKER_ENABLED` | Process documents inside the API process | `true` |
| `LOG_FORMAT` | `json` or `text` | `json` |

`.env.example` lists every setting.

## API

All routes except sign-up and sign-in take an `Authorization: Bearer <token>` header. With the API running locally, the full interactive reference is at `/docs`.

| Area | Routes |
|---|---|
| Sign-in | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/verify-email`, `/auth/resend-code`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/firebase`; `GET /auth/providers`, `/auth/me`, `/auth/me/usage` |
| Account | `GET` and `PATCH /account`; `POST /account/password`, `/account/sign-out-everywhere`, `/account/connect`, `/account/delete`; `PUT /account/story-preferences` |
| Documents | `POST /documents/upload`; `GET /documents`, `/documents/{id}`; `POST /documents/{id}/retry`; `DELETE /documents/{id}` |
| Questions | `POST /chat/ask`; `GET` and `DELETE /chat/history/{document_id}` |
| Stories | `POST /videos/generate/{document_id}`; `GET /videos`, `/videos/voices`, `/videos/{id}`, `/videos/{id}/download` |
| Shelf and plans | `GET /activity`, `GET /plans` |
| Health | `GET /health`, `GET /ready` |

A question looks like this:

```json
POST /chat/ask
{"question": "Where will the new data centre open?", "document_id": "...", "top_k": 3}
```

```json
{
  "answer": "The new data centre opens in Singapore [S1].",
  "answer_status": "answered",
  "sources": [
    {"source_id": "S1", "page_start": 4, "page_end": 4, "similarity_score": 0.71, "cited": true,
     "preview": "Expansion. A new data centre ..."}
  ]
}
```

## Tests

```bash
pytest -q          # API
ruff check .
cd frontend && npm test && npm run lint
```

The suite covers every feature plus:

- **Loophole tests:** every route without credentials, cross-user access to every resource, hostile IDs and filenames, and rate-limit evasion.
- **Property tests with Hypothesis:** chunking never loses or invents text, document text cannot escape its prompt, and citations only name retrieved sources.
- **Failure injection:** database outages, a full disk, parser crashes, stalled providers and shutdowns.
- **Retrieval evaluation:** `python scripts/evaluate_retrieval.py --check` scores search against 37 labelled questions.

CI runs all of this on SQLite and PostgreSQL, audits dependencies, scans history for secrets with Gitleaks, and starts the full Docker stack for a smoke test. A nightly run repeats the property tests with 2,000 examples each.

See [SECURITY.md](SECURITY.md) for how guruCool handles security.
