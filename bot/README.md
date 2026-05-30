# bot

WhatsApp bot (PRD §5.1) — **Baileys** (Node.js), the main entry point.

Connects directly to the WhatsApp WebSocket protocol (no headless browser, ~50–120MB).
Hybrid interaction: natural-language understanding plus quick-reply buttons for common
actions (post an activity, view activities, cancel, change time, my activities, edit profile).

> ⚠️ Baileys is unofficial and violates WhatsApp's ToS — use a dedicated number and plan
> to migrate to the official Business API (Meta Cloud / 360dialog) as we scale.
