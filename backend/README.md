# backend

API server (PRD §6) — **Rust**, backed by **PostgreSQL**.

Modules:
- **NLU** — calls an LLM to parse a natural-language sentence into date / time / location / activity type
- **Matching** — similarity scoring on time + location + age group (PRD §4.5)
- **Location library** — prefilled Maastricht kid-friendly spots (PRD §7)
- **Notify** — pushes messages to WhatsApp via the bot
