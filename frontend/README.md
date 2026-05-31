# frontend

Production website (PRD §5.2) — **React + Vite + TailwindCSS**, mobile-first.

Browse entry point for activities. Pages: Home `/`, Activities `/activities`,
Activity detail `/activities/:id`, About `/about`. Tapping "I want to come" continues the
flow in Telegram (`t.me/<bot>?start=…` deep link).

Promoted from the `design/` prototype: the mock `data/*.js` is replaced by a typed API
client (`src/lib/api.js`) and a reference-data context (`src/context/Reference.jsx`) that
loads groups/spots from the API. Components and pages are otherwise the prototype's.

## Run
```sh
npm install
cp .env.example .env          # VITE_API_BASE, VITE_BOT_USERNAME
npm run dev                   # http://localhost:5173
```

## Build / deploy
`npm run build` → `dist/`. Deployed to GitHub Pages (kidgo.bryht.net) by
`.github/workflows/deploy.yml` on push to `main`, which builds this folder with
`VITE_API_BASE=https://api.bryht.net/kid-go`. Set the repo variable `KIDGO_BOT_USERNAME`
to the Telegram bot's username for the "I want to come" links.
