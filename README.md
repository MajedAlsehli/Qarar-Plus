# Jisr AI — Interactive Prototype

**Embedding AI-Powered Decision Support into HR Operations, Employee Development, and Promotion Decisions**

A working interactive prototype built to validate a product proposal for [Jisr](https://www.jisr.net/en), Saudi Arabia's leading HR SaaS platform. The prototype demonstrates three AI-powered capabilities layered directly on top of real employee and HR data, with OpenAI used exclusively to narrate pre-computed, deterministic facts in natural language — never to invent data or make decisions.

---

## The Problem

Jisr already gives organizations one integrated place for payroll, attendance, leave, recruitment, performance, and employee records. But having the data in one place doesn't automatically make it easy to use. Day-to-day HR work still leans heavily on people manually searching for information and applying their own judgment before they can respond or act.

This shows up in three ways:

- **Routine operations** — Answering a simple question about leave or attendance requires opening several parts of the platform and cross-referencing manually, with no built-in prioritization.
- **Employee development** — Training decisions happen once a year, by gut, with no structured way to match an employee's actual skill gaps to the right course. Two HR specialists can produce two different plans for the same employee.
- **Promotion readiness** — Every promotion case requires manually reassembling performance, tenure, training, attendance, and policy data — information that already lives in Jisr, just not gathered in one place that clearly says whether someone is ready.

---

## The Solution

Three complementary AI capabilities, each following the same guiding principle: **compute every fact deterministically from the database, then use AI only to narrate those facts in plain language.**

### Feature 1 — AI HR Copilot
A conversational interface that answers both organization-wide and employee-specific HR questions instantly. Questions are classified by intent, resolved against the database, and narrated naturally. For employee-specific queries, the Copilot scopes the request to the correct department and employee before responding — OpenAI never queries the database or constructs answers on its own.

### Feature 2 — AI L&D Recommendation System
Analyzes each employee's performance review notes and matches them against the course catalog using keyword overlap scoring. Each recommendation comes with a relevance percentage and a plain-language AI rationale. HR reviews every recommendation individually, approves or rejects it, then forwards the decision by name to the employee's manager. The employee never receives AI output directly.

### Feature 3 — AI Promotion Readiness Predictor
Instantly evaluates six policy criteria — performance rating, goal achievement, leadership certification, manager feedback, peer feedback, and tenure — producing a readiness score with a transparent breakdown. Ready employees are routed to the manager for formal committee review; not-ready employees are routed to the manager as development feedback. The outcome is never sent to the employee directly.

---

## Core AI Pattern

```
SQL query → computed facts → OpenAI narration → HR review → human action
```

Every number, name, and percentage in the UI comes from a deterministic database query. OpenAI receives those facts and writes a 1–2 sentence human-readable explanation. This prevents hallucination and keeps every output fully traceable to real data.

---

## Architecture

```
Express server (Node.js)
  ├── /public                   → Single-page frontend (HTML/CSS/vanilla JS)
  ├── /api/departments          → Employee and department directory
  ├── /api/requests             → Pending requests queue
  ├── /api/copilot              → HR Copilot (intent classification + DB queries + AI narration)
  ├── /api/recommendations      → L&D workflow (generate → HR review → forward → present)
  ├── /api/promotion            → Promotion readiness scoring + AI explanation
  ├── /api/employees            → Employee quick-profile snapshots
  ├── /api/notifications        → Notification center (SLA reminders, action confirmations)
  └── /api/reset                → Demo reset (clears notifications, recommendations, reseeds requests)

PostgreSQL
  ├── departments, salary_grades, employees
  ├── attendance_records, requests
  ├── performance_reviews, courses, recommendations
  ├── overtime_records, training_completions, disciplinary_records
  ├── headcount_requests, exit_records, hr_policies
  └── notifications

OpenAI (gpt-4o-mini)
  └── Narration only — never invents data or queries the database
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Steps

```bash
# 1. Clone and install
git clone <your-repo-url>
cd jisr-ai
npm install

# 2. Create a Postgres database
createdb jisr_ai

# 3. Configure environment
cp .env.example .env
# Fill in:
#   DATABASE_URL=postgresql://localhost/jisr_ai
#   OPENAI_API_KEY=sk-...
#   OPENAI_MODEL=gpt-4o-mini   (optional, this is the default)
#   PORT=3000                  (optional)

# 4. Seed the database
npm run seed

# 5. Start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Render Deployment

1. Push this repo to GitHub.
2. In [Render](https://render.com), create a new **Web Service** → connect your GitHub repo.
3. Add a **PostgreSQL** database in Render and copy the external connection string.
4. Set environment variables in the Render service:
   - `DATABASE_URL` — your Render Postgres connection string
   - `OPENAI_API_KEY` — your OpenAI key
   - `OPENAI_MODEL` — `gpt-4o-mini` (or leave unset)
5. Set the **Start Command** to `npm start`.
6. After first deploy, run the seed from your local machine:
   ```bash
   DATABASE_URL="<your-render-db-url>" npm run seed
   ```

### Resetting demo data
Hit the **↺ Reset** button in the navbar — it clears all notifications and recommendations and reseeds all requests back to their original demo state in one click.

---

## Design Principles

**Human in the loop, always.** Every AI output goes to HR first, then to the employee's manager. The employee never sees AI-generated content directly.

**Explainable by default.** Every score and recommendation includes a plain-language rationale showing exactly which factors drove it.

**Decision support, not decision-making.** The final action in every feature — approving a request, assigning a course, advancing a promotion — remains in human hands.

---

*Built by Team 4 as part of the AI Fundamentals Bootcamp at Tuwaiq Academy in collaboration with Meta. July 2026.*
