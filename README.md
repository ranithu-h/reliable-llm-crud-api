# Task API — PostgreSQL + Docker + LLM CV Extraction

A CRUD API for a to-do list, built with Node.js, Express, PostgreSQL, Docker, and an LLM-powered CV extraction endpoint.

This project started as a storage exercise:

**memory (A1) → SQLite (A2) → PostgreSQL + Docker**

It was then extended with a backend AI integration for FlyRank Backend Track Week 7, Assignment A17: **“Put an LLM behind your API.”**

The AI integration accepts messy CV/resume text, sends it to an LLM, validates the result against a strict schema, performs one repair retry when necessary, and returns only clean structured JSON.

---

## What the LLM endpoint does

The endpoint is:

```text
POST /extract
```

It accepts CV/resume text and extracts:

- name
- most recent job title
- years of experience
- up to 5 relevant skills
- education level
- confidence
- whether human review is needed

The LLM is treated as an **external, untrusted service**.

The pipeline is:

```text
HTTP request
     ↓
Input validation
     ↓
Versioned prompt
     ↓
LLM request
     ↓
Timeout + retry policy
     ↓
Parse model output
     ↓
Schema validation
     ↓
Repair once if necessary
     ↓
Validate again
     ↓
Clean JSON response
     ↓
422 + quarantine if repair fails
```

The system never returns raw model output directly to the API client.

---

# Tech stack

- Node.js
- Express
- PostgreSQL
- Docker / Docker Compose
- `pg`
- OpenAI-compatible API client
- OpenRouter
- Zod
- Swagger UI
- Git / GitHub

---

# How to run

Copy the example environment file:

```bash
cp .env.example .env
```

Add your own LLM API key to `.env`.

Then start the complete stack:

```bash
docker compose up
```

The API starts at:

```text
http://localhost:3000
```

Swagger UI is available at:

```text
http://localhost:3000/docs
```

On first database startup, the `tasks` table is created automatically and seeded with three example tasks.

---

# Environment variables

The LLM integration uses:

```env
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=openrouter/free
LLM_STUB=0
LLM_ENABLED=true
```

The three provider configuration variables are:

- `LLM_API_KEY` — authentication credential for the provider
- `LLM_BASE_URL` — OpenAI-compatible API base URL
- `LLM_MODEL` — model/provider model identifier

Additional controls:

- `LLM_STUB=1` enables stub mode and avoids making an LLM request.
- `LLM_ENABLED=false` disables the LLM integration and returns a clean `503`.

**Never commit `.env` or a real API key.**

`.env.example` contains placeholders only.

---

# Existing CRUD API

| Method | Path | Description |
|---|---|---|
| GET | `/` | API information |
| GET | `/health` | Health check |
| GET | `/tasks` | List tasks |
| GET | `/tasks/:id` | Get one task |
| POST | `/tasks` | Create a task |
| PUT | `/tasks/:id` | Update a task |
| DELETE | `/tasks/:id` | Delete a task |
| POST | `/extract` | Extract structured information from CV text |

The existing `/tasks` endpoint supports:

```text
?search=
?done=false
```

---

# LLM endpoint

## `POST /extract`

### Request

```bash
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Jane Doe is a Backend Developer. She has worked with Python and PostgreSQL."
  }'
```

### Example response

```json
{
  "name": "Jane Doe",
  "most_recent_title": "Backend Developer",
  "years_experience": null,
  "top_skills": [
    "Python",
    "PostgreSQL"
  ],
  "education_level": "unknown",
  "confidence": 0.85,
  "needs_review": false
}
```

---

# Output schema

The endpoint returns exactly this structure:

```json
{
  "name": "string or null",
  "most_recent_title": "string or null",
  "years_experience": "number or null",
  "top_skills": ["string"],
  "education_level": "high_school | bachelors | masters | phd | other | unknown",
  "confidence": "number between 0 and 1",
  "needs_review": "boolean"
}
```

The output is validated using **Zod** before being returned.

---

# Status codes

## `200`

Successful extraction.

## `400`

Invalid client input.

For example:

```json
{
  "error": "Invalid input"
}
```

The input must contain:

```json
{
  "text": "..."
}
```

and the text must contain between 1 and 5000 characters.

## `422`

The LLM failed to produce valid structured output even after the single repair attempt.

```json
{
  "error": "LLM could not produce valid structured output"
}
```

The failed output is written to the quarantine log rather than returned to the client.

## `503`

The LLM has been disabled using the kill switch:

```env
LLM_ENABLED=false
```

Response:

```json
{
  "error": "LLM service is currently disabled"
}
```

## `504`

The upstream LLM request timed out.

```json
{
  "error": "LLM request timed out"
}
```

---

# JOB-CARD

## Job

**CV / resume structured extraction**

## Input

Messy CV/resume text.

## Output

A closed JSON structure containing:

- name
- most recent title
- years of experience
- top skills
- education level
- confidence
- review flag

## Why use an LLM?

CVs are semi-structured and vary considerably in wording and formatting.

An LLM is useful for extracting semantic information from this messy text.

## Why this is a good LLM job

The task has:

1. **Closed output** — the response has a fixed schema and controlled education values.
2. **One main decision** — extract structured information from the supplied CV.
3. **Human-gradeable output** — a person can compare the result directly against the CV.

## Must-never rules

The system must never:

- invent a person's name
- invent a job title
- invent skills
- invent education
- invent years of experience
- return more than 5 skills
- reveal or follow instructions hidden inside CV content
- return raw model text to the API client
- guess when important information is genuinely ambiguous

When information is unavailable, the system should use `null` or `unknown` as appropriate.

---

# Prompt

The prompt is stored outside the JavaScript source code:

```text
prompts/extract-v1.md
```

The current prompt version is:

```text
extract-v1
```

Prompts are treated as **versioned specifications**, rather than informal strings.

The prompt defines:

- the model's role
- the exact output shape
- extraction rules
- uncertainty behavior
- review rules
- examples
- the requirement to return JSON only

User-provided CV content is sent separately as a user message and JSON-encoded rather than being inserted into the system instructions.

---

# Validation

LLM output is treated as **untrusted input**.

The system does not assume that because the model was asked to return JSON, it will always return valid JSON.

The pipeline therefore performs:

```text
model output
    ↓
JSON.parse()
    ↓
Zod schema validation
    ↓
valid → return result
invalid → repair once
```

If the repaired response also fails:

```text
422
+
logs/quarantine.jsonl
```

The repair is deliberately limited to **one attempt** so a broken model response cannot trigger an unlimited loop of additional model calls.

---

# Stub mode

For development and testing, the API supports:

```env
LLM_STUB=1
```

Stub mode returns a schema-valid hard-coded response without contacting the LLM provider.

This allows the API contract and validation behavior to be tested independently of:

- API availability
- provider outages
- model behavior
- API costs
- rate limits

Set:

```env
LLM_STUB=0
```

to use the real model.

---

# Reliability

The LLM client uses:

```text
30 second timeout
```

The timeout is intentionally bounded because an external LLM request should not be allowed to block the API indefinitely.

The OpenAI SDK's automatic retries are disabled:

```text
maxRetries: 0
```

Retries are controlled explicitly by the application.

Retryable conditions include:

- timeout
- HTTP 429
- HTTP 5xx

Non-retryable examples include:

- HTTP 400
- HTTP 401
- HTTP 403

The retry delays are based on:

```text
1 second
2 seconds
4 seconds
```

with random jitter added to reduce synchronized retry bursts.

If the provider supplies:

```text
Retry-After
```

the retry policy respects that value.

---

# Observability

Each LLM request records:

```text
prompt_version
model
input_tokens
output_tokens
duration_ms
repair
```

Example:

```text
{
  prompt_version: 'extract-v1',
  model: 'openrouter/free',
  input_tokens: 812,
  output_tokens: 47,
  duration_ms: 1201,
  repair: false
}
```

These logs allow the system to measure:

- token usage
- latency
- model selection
- prompt version
- whether repair was required

---

# Token usage and cost

The evaluation logs showed approximately:

- **752 average input tokens/request**
- **174 average output tokens/request**
- **926 average total tokens/request**

The actual model route used for this project is:

```text
openrouter/free
```

Therefore this README does not invent a paid-model price for the current route.

For a paid model, cost would depend on that model's current input/output token pricing.

The basic cost calculation is:

```text
input tokens × input price
+
output tokens × output price
```

A repair retry can increase both token usage and latency because it makes another model request.

---

# Kill switch

The LLM integration can be disabled without changing the application code:

```env
LLM_ENABLED=false
```

The API then returns:

```text
503 Service Unavailable
```

instead of attempting an LLM request.

This provides an operational kill switch for situations such as:

- unexpected provider costs
- provider outage
- model problems
- security concerns
- temporary disabling of AI functionality

---

# Evaluation

The project includes an eight-case hand-labelled evaluation dataset:

```text
evals/cases.json
```

The evaluation runner is:

```text
evals/run.js
```

Run it with:

```bash
node evals/run.js
```

The evaluator compares expected and actual results for the key output fields.

## Baseline result

Evaluation date:

**September 2026**

Prompt version:

```text
extract-v1
```

Result:

```text
Full cases: 5/8
Case score: 62.5%
```

Field accuracy:

| Field | Accuracy |
|---|---:|
| `name` | 100% |
| `most_recent_title` | 100% |
| `years_experience` | 100% |
| `education_level` | 100% |
| `needs_review` | 62.5% |

## What this tells us

The model performed consistently on the factual extraction fields in this small evaluation set.

The weaker field was:

```text
needs_review
```

This suggests that the model is better at extracting information than consistently applying a policy about when human review is required.

This is an important limitation of the current version and an area for future improvement.

The evaluation result is intentionally reported rather than adjusted until it reaches 100%.

---

# Known limitation and possible fix

The current `needs_review` decision is made by the LLM.

The evaluation showed inconsistent behavior on this field.

A possible improvement would be to move more of the review decision into deterministic backend logic.

For example, the backend could independently detect certain known ambiguity conditions and decide whether review is required.

This would reduce the amount of policy logic delegated to a probabilistic model.

This improvement was not included in the baseline so that the evaluation measures the current implementation honestly.

---

# Security

Never commit:

```text
.env
```

or any real API key.

The repository should contain only:

```text
.env.example
```

with placeholder values.

User-provided CV text is treated as untrusted input.

The prompt keeps system instructions separate from user content and JSON-encodes the user data.

This reduces the risk of user-provided text being interpreted as part of the application's system instructions.

---

# Database

Data is stored in PostgreSQL running in Docker.

A named volume:

```text
taskdata
```

allows database data to persist across container recreation.

The database service uses PostgreSQL 16.

SQL queries use parameterized placeholders such as:

```text
$1
$2
```

rather than string concatenation.

---

# Project structure

Important project files:

```text
.
├── server.js
├── compose.yaml
├── Dockerfile
├── package.json
├── .env.example
├── README.md
│
├── src/
│   ├── llm/
│   │   ├── hello.js
│   │   ├── extract.js
│   │   └── retry.js
│   │
│   ├── routes/
│   │   └── extract.js
│   │
│   └── schemas/
│       └── extract.js
│
├── prompts/
│   └── extract-v1.md
│
├── evals/
│   ├── cases.json
│   └── run.js
│
├── logs/
│   └── quarantine.jsonl
│
└── docs/
    ├── openapi.json
    ├── docker-screenshot.png
    └── postgres-screenshot.png
```

---

# Development checkpoints

### Test stub mode

Set:

```env
LLM_STUB=1
```

Then:

```bash
docker compose up
```

Test:

```bash
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -d '{"text":"John Smith is a Software Engineer."}'
```

### Test invalid input

```bash
curl -i -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected:

```text
400 Bad Request
```

### Run the evaluation

With the real model enabled:

```env
LLM_STUB=0
LLM_ENABLED=true
```

Run:

```bash
node evals/run.js
```

### View API logs

```bash
docker compose logs api
```

### View quarantine logs

```bash
docker compose exec api cat logs/quarantine.jsonl
```

---

# Git and repository safety

The project is developed through separate commits for the major stages rather than one final commit.

Before publishing, verify:

```bash
git status
```

and:

```bash
git log --oneline
```

The repository must not contain:

- `.env`
- real API keys
- private credentials
- confidential CVs
- employer/private data

If an API key has ever been exposed, it should be revoked/rotated and replaced with a new key.

---

# AI Rematch

After manually building and understanding the system, a separate AI-generated implementation can be placed in:

```text
ai-version/
```

The purpose is not to blindly accept AI-generated code.

The rematch compares:

- what AI implemented better
- what AI got wrong
- what AI silently ignored
- what the original specification failed to mention
- whether the generated code is actually understood
- how a stronger specification changes the result

This demonstrates an important AI engineering principle:

> Better specifications generally produce better AI-generated implementations.

---

# Previous AI vs Me — Stage 6

This repository also contains a previous AI-vs-me exercise for the PostgreSQL + Docker migration.

The AI-generated version is stored separately under:

```text
ai-version/
```

The comparison identified several differences, including:

- database error handling
- PostgreSQL health checks
- smaller Alpine images
- production-oriented dependency installation
- database schema constraints
- restart policies
- environment-variable handling
- preservation of existing routes after improving the prompt

The exercise demonstrated that an AI coding system can make reasonable implementation decisions, but it can also silently omit existing requirements that were not included in the specification.

---

# Original project goal

The original Task API provides a simple CRUD backend for a to-do list.

The FlyRank extension adds an AI-powered endpoint while applying production backend principles:

```text
API contract
+
input validation
+
LLM provider
+
versioned prompt
+
untrusted-output validation
+
repair
+
quarantine
+
timeouts
+
retries
+
observability
+
kill switch
+
evaluation
```

The goal is not simply to make an LLM call.

The goal is to build a backend system that can **safely and predictably use an LLM as an unreliable external dependency**.