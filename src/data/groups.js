// Developmental-stage grouping — the brand core (PRD §1, §4.1)
export const GROUPS = [
  { id: 'newborn', emoji: '🍼', name: 'Newborn', range: '0–6 months', color: 'bg-sky-100 text-sky-700 ring-sky-200' },
  { id: 'explorer', emoji: '🐛', name: 'Explorer', range: '6–12 months', color: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  { id: 'toddler', emoji: '🚶', name: 'Toddler', range: '12–24 months', color: 'bg-amber-100 text-amber-700 ring-amber-200' },
  { id: 'talker', emoji: '🗣️', name: 'Talker', range: '2–3 years', color: 'bg-violet-100 text-violet-700 ring-violet-200' },
  { id: 'creator', emoji: '🎨', name: 'Creator', range: '3–5 years', color: 'bg-rose-100 text-rose-700 ring-rose-200' },
]

export const groupById = (id) => GROUPS.find((g) => g.id === id)
