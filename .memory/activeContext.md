## Active Context – Agent & Skill Creator

### Current Task

Reconstruct the project **Memory Bank** (`.memory/` folder) so that it reflects the original **agent + skill + knowledge space + RAG/CrewAI** vision rather than only the low‑level Next.js implementation details.

### Focus / Notes

- The Memory Bank now:
  - Describes the product as an **Agent & Skill Creator** with:
    - **Skills** (reusable tools).
    - **Agents** (skills + knowledge spaces + instructions).
    - **Knowledge spaces** (general, project, agent) that drive RAG.
  - Mentions the use of **RAG**, **CrewAI**, **Ollama** (phi4‑mini, qwen2.5‑coder:3b), and **Supabase vector** at a conceptual level.
  - Acknowledges existing Next.js/i18n/auth/theming shell as the UI host rather than the core of the product itself.
- The orgs/seats and **Phase 1 core** planning documents are not fully available in this repo; once they are finalized or restored, this Memory Bank should be revisited and aligned with them.
- Future tasks should:
  - Update `progressState.md` when major features are implemented (knowledge spaces, skills registry, agent creator, crews, orgs/seats).
  - Update this `activeContext.md` whenever the main focus shifts to a new feature area.
  - Keep `projectBrief.md` and `productContext.md` synced with any large product or architecture decisions.

## Active Context – Agent Creator

### Current Task

Reconstruct and initialize the project Memory Bank (`.memory/` folder) so that future work can reliably use and update:

- `projectBrief.md`
- `productContext.md`
- `progressState.md`
- `activeContext.md`

The goal is to have accurate, living documentation of project goals, product behavior, current state, and the active focus.

### Focus / Notes

- Derived content from the current codebase only (Next.js 16, Supabase auth, `next-intl`, Ant Design, centralized styling), without assuming unimplemented features.
- Left explicit **TODO** markers in the brief and product context for:
  - Refining goals and target users.
  - Defining concrete “agent” and “skill” features.
  - Populating upcoming work items in `progressState.md`.
- Future tasks should:
  - Update `progressState.md` when major features or flows are added/changed.
  - Update this `activeContext.md` when switching focus to a new task or area.
  - Adjust `projectBrief.md` or `productContext.md` only when goals, constraints, or product behavior materially change.

