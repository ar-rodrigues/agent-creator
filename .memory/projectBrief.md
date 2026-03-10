## Project Brief – Agent & Skill Creator

### Overview

This project is a tool to **create agents and skills** that operate over user‑uploaded files using **RAG** and an **orchestrated multi‑agent setup**.

- **Agents**:
  - Configurable entities with a role/instructions.
  - Can have **knowledge** attached (documents) and use one or more **skills**.
  - Knowledge is split into:
    - **General** knowledge (e.g. company‑wide finance reports, brand guidelines).
    - **Project‑specific** knowledge (e.g. “Report January 2026”).
    - Optional **agent‑specific** knowledge.
- **Skills**:
  - Reusable “tools” that multiple agents can share.
  - Encapsulate behaviors such as document analysis, summarisation, consistency checks, etc.
  - Implemented as programmatic tools callable by the LLM / agent runtime.
- **Knowledge spaces** (conceptual):
  - Logical groupings of documents, tagged as **general**, **project**, or **agent**.
  - Agents attach one or more knowledge spaces; RAG queries the **union** of those spaces.

The long‑term goal is that a user can upload files, define reusable skills, compose agents from those skills and knowledge spaces, and then run agents (or crews of agents) to perform complex document‑centric tasks.

### Goals

- **Primary goals**
  - Let users **create and manage skills** (reusable tools).
  - Let users **create and manage agents** that:
    - Use selected skills.
    - Operate over selected knowledge spaces (general + project + agent‑specific).
  - Support **document‑centric workflows** such as:
    - Financial report analysis.
    - Brand consistency checks.
    - Project‑specific reporting (e.g. “Report January 2026”).
  - Provide a UI that:
    - Manages uploads and knowledge spaces.
    - Configures skills and agents.
    - Triggers runs and shows results.

- **Secondary goals**
  - Support **parallel agents** using CrewAI (or equivalent) when beneficial.
  - Keep the system **LLM‑provider‑agnostic**, with an abstraction that can swap local vs. cloud models.
  - Make the project **agent‑friendly** (clear Memory Bank, clear plans) so AI coding agents can work in this repo reliably.

### Tech & Architecture Intent

- **Orchestration / agents**
  - **CrewAI** to orchestrate one or more agents and tasks, including parallel execution where it makes sense.
  - Each agent constructed from:
    - A set of skills (programmatic tools).
    - A set of knowledge spaces.
    - Model configuration and instructions.

- **LLM layer**
  - Initially **local LLMs via Ollama**:
    - `phi4-mini` (general reasoning / document work).
    - `qwen2.5-coder:3b` (code‑oriented tasks, if/when needed).
  - Provide a **single abstraction** for model calls so that:
    - Switching to cloud models later (e.g. hosted LLM APIs) does not require rewriting agents/skills.

- **RAG & storage**
  - **Supabase** with pgvector (or Supabase vector) for storing embeddings per knowledge space.
  - Files stored in Supabase Storage (or equivalent), linked to one or more knowledge spaces.
  - RAG tools query embeddings filtered by `knowledge_space_id` (and, where needed, `project_id` / `agent_id`).

- **Frontend / shell**
  - **Next.js App Router**, TypeScript, React.
  - Public + private layouts, auth, and localization (en/es) already set up.
  - This UI serves as the **Agent & Skill Creator** surface for configuring knowledge, skills, and agents.

### Constraints & Assumptions

- **Local‑first LLMs**
  - Use local models via **Ollama** by default (phi4‑mini, qwen2.5‑coder:3b).
  - Keep model calls abstracted so a future move to hosted models is straightforward.

- **Programmatic tool calling**
  - Skills should be exposed as **programmatic tools**, not just textual instructions.
  - Prefer native tool/function‑calling when the chosen model supports it.
  - If tool‑calling support is weak or absent, fall back to a prompt‑based protocol as a first iteration.

- **Parallel work**
  - The system should be able to **run multiple agents in parallel** (e.g. CrewAI crews).
  - Not all tasks need parallelism; design for it but do not overcomplicate trivial flows.

- **Knowledge separation**
  - Always separate **general** company knowledge from **project/agent‑specific** knowledge.
  - A given agent’s RAG context is the **union** of the knowledge spaces that are explicitly attached to it.

### Roadmap / Open Questions

- How exactly “Skills”, “Agents”, and “Knowledge spaces” are modelled in the database (schema details, relations).
- How “Open Agent” fits in:
  - Is it a specific library to integrate, or more of a product concept layered on top of CrewAI?
- Which embedding model(s) to use:
  - Via Ollama, Supabase, or another local/hosted embedding model.
- Finalize how organizations, seats, and **Phase 1 core features** map onto this agent/skill/knowledge model (see separate orgs/seats & phase‑1 planning).

> TODO (maintainer): Once product requirements and orgs/seats/phase‑1 decisions are finalized, update this brief so it becomes the authoritative source of **what** we are building and **why**.

## Project Brief – Agent Creator

### Overview

Agent Creator is a Next.js application that lets users **create agents and skills**. It is built with the App Router and a localized, authenticated experience so that future agent- and skill-focused workflows can sit behind a secure dashboard.

### Goals

- Provide a solid, production-ready foundation for an “agent & skill” product:
  - Authenticated dashboard where users will eventually manage agents and skills.
  - Public marketing/landing experience that introduces the product and funnels users into auth.
  - Internationalized experience for English and Spanish audiences.
- Keep implementation **agent-friendly** (clear structure, conventions, and Memory Bank) so AI coding agents can work effectively in this repo.

> TODO (maintainer): Refine / expand these goals once product requirements are clearer (e.g. what “create agents and skills” means in terms of concrete features, data models, and user journeys).

### Tech Stack

- **Framework**: Next.js 16 (App Router, React 19, TypeScript).
- **Language**: TypeScript across app, hooks, and libraries.
- **UI / Styling**:
  - Ant Design (`antd`) with dynamic theming via `ConfigProvider` and `App` (see `components/Providers.tsx`).
  - Centralized design tokens and CSS variables (see `styles/tokens.css`, imported from `app/globals.css`).
  - Reusable layout and UI primitives:
    - `components/layout/Container.tsx`
    - `components/layout/Stack.tsx`
    - `components/ui/Card.tsx`
    - Header and footer components (public/private variants).
- **Auth & Data**:
  - Supabase via `@supabase/ssr` for browser/server clients and middleware:
    - `lib/supabase/client.ts`
    - `lib/supabase/server.ts`
    - `lib/supabase/middleware.ts`
  - Auth logic encapsulated in custom hooks and routes:
    - `hooks/useAuth.ts`
    - `hooks/useSupabaseClient.ts`
    - `app/[locale]/(public)/auth/*`
    - `app/[locale]/(private)/*`
- **Internationalization**:
  - `next-intl` for routing, middleware, and translations.
  - Routing config in `i18n/routing.ts` and navigation helpers in `i18n/navigation.ts`.
  - Locale-aware layouts under `app/[locale]/layout.tsx`.
  - Message catalogs in `messages/en.json` and `messages/es.json`.
- **Email**:
  - `nodemailer` wrapper in `lib/mailer.ts` for SMTP-based email sending (e.g. future notifications, transactional mail).

### Architecture & Structure

- **App routing**
  - Localized root layout: `app/[locale]/layout.tsx`.
  - **Public route group**: `app/[locale]/(public)/…`
    - Landing page: `app/[locale]/(public)/page.tsx`
    - Auth flows under `app/[locale]/(public)/auth/*`
    - Public layout: `app/[locale]/(public)/layout.tsx` using `PublicHeader` and `Footer`.
  - **Private route group**: `app/[locale]/(private)/…`
    - Dashboard: `app/[locale]/(private)/dashboard/page.tsx`
    - Private layout: `app/[locale]/(private)/layout.tsx` with auth guard (`createSupabaseServerClient`) and sidebar navigation.
- **Middleware & session handling**
  - `proxy.ts` combines `next-intl` middleware with Supabase `updateSession` to keep auth cookies in sync.
  - `lib/supabase/middleware.ts` encapsulates middleware-level Supabase client wiring and error-tolerant `auth.getUser()` calls.

### Conventions & Constraints

- **Custom hooks for API/auth**
  - Use custom hooks in `hooks/` for Supabase and other API interactions.
  - Example: `useAuth` centralizes auth state, loading, and error reporting; consumers do not talk to Supabase directly.
- **Error handling**
  - Deal with errors gracefully and surface them to the UI when appropriate (e.g. `useAuth` stores an error string that `AuthForm` displays via `Alert`).
  - Avoid throwing in UI components for expected failure modes (e.g. invalid credentials); instead, show inline feedback.
- **Styling**
  - Use centralized CSS variables and tokenized spacing/typography from `styles/tokens.css`.
  - Prefer `Container`, `Stack`, and `Card` over ad-hoc layout markup and raw CSS values.
  - When using Ant Design:
    - Do not call static `message.*` / `notification.*` / `Modal.*` APIs; instead, get instances via `App.useApp()` inside components.
    - Avoid deprecated props like `message` on `Alert`; use `title` instead (already followed in `AuthForm`).
- **Theming**
  - Theme preference (`light` / `dark` / `system`) is managed by `components/ThemeProvider.tsx` and persisted in `localStorage`.
  - Effective theme is applied via `data-theme` and `color-scheme` on `document.documentElement`, with a matching inline script in `app/layout.tsx` to avoid hydration flicker.
  - Ant Design theme algorithms (light/dark) are driven by the resolved theme in `components/Providers.tsx`.

### Environment & Deployment Assumptions

- Requires the following environment variables (non-exhaustive):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SMTP_HOST`, `SMTP_PORT` (and optionally `SMTP_USER`, `SMTP_PASS`) for email.
- Intended to run as a standard Next.js app (e.g. `next dev`, `next build`, `next start`), deployable to platforms like Vercel.

### Roadmap / Open Questions

- What specific “agent” and “skill” entities will the dashboard manage (schema, storage, workflows)?
- Which user segments is Agent Creator targeting (internal developers, broader community, non-technical users)?
- How should permissions and multi-tenant access be modeled (if at all)?

> TODO (maintainer): Once you define concrete product requirements, update this brief so it becomes the authoritative source of **what** we are building and **why**.

