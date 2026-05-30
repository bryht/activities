# KidGo — Product Requirements Document

> Help parents find playmates and activities for same-age kids

**Date**: 2026-05-30  
**City**: Maastricht, 🇳🇱  
**Language**: English (for now)

---

## 1. Vision

In a new city or in everyday life, parents struggle to find playmates of the same age for their child. **KidGo** lets a parent post "I want to go play" in a single sentence, and the system helps match families in the same area, at a similar time, and in the same age group — helping kids build a social circle.

### Core Value

- **Simple** — post an activity in one sentence, no forms to fill in
- **Proactive** — the system finds people for you; you don't have to search
- **Safe** — privacy is disclosed progressively; contact details are exchanged only when both sides want to

### The Edge (what sets us apart)

- **Developmental-stage grouping is the brand core**: we use "Explorer / Toddler / Talker" stages instead of cold raw ages — parents relate emotionally and instantly know "which stage my kid is in."
- **Recurring weekly meetups > one-off activities**: family life has a rhythm (library on Tuesdays, park on weekends), and retention comes from the standing weekly meetup.

---

## 2. Target Users

- **Primary users**: parents of children aged 0–5 (mostly moms)
- **Area**: Maastricht and surroundings
- **Community**: starting with the local Chinese-speaking community, English interface for now

---

## 3. User Scenarios

### Scenario A — Post an activity

> **Amy → Bot**: "Saturday 2pm, sandbox at Stadspark"
>
> **Bot → Amy**: 📅 Activity created! Sat 14:00 · Stadspark · Toddler (12–24m). I'll let you know when someone joins!

### Scenario B — Browse activities

> Beth opens the website → sees the activity list → taps "I want to come" → joins the activity.

### Scenario C — Smart match

> **Cara → Bot**: "Saturday afternoon, walk the kid at Bonnefanten park"
>
> **Bot → Cara**: ⚡ Amy is also at Stadspark sandbox Sat 14:00, right nearby — want to join her? [Join] [No thanks]

### Scenario D — Join notification

> **Bot → Amy**: 🎉 Beth wants to join your Saturday sandbox activity! Beth's baby: 10 months (Explorer). [Leave a message]

---

## 4. Functional Requirements

### 4.1 Registration

The user scans a QR code and adds the bot. When the bot detects a new user, it asks for and collects the information needed to register.

Information collected:
- **Contact** — WhatsApp number (required)
- **Nickname** — "How should we call you?" (required)
- **Group of interest** — pick the age group(s) (required)
- **City** — defaults to Maastricht

**Groups:**

| Group | Age range |
|-------|-----------|
| 🍼 Newborn | 0–6 months |
| 🐛 Explorer | 6–12 months |
| 🚶 Toddler | 12–24 months |
| 🗣️ Talker | 2–3 years |
| 🎨 Creator | 3–5 years |

### 4.2 Create an Activity

**Input:** one natural-language sentence ("Saturday 2pm, sandbox at Stadspark" / "Tomorrow morning, picture-book corner at the library"), or by sharing a link or material.

The bot automatically extracts:
- **Date** — "Saturday" → the nearest Saturday
- **Time** — "2pm" → 14:00
- **Location** — matched against the local location library
- **Activity type** — "sandbox" / "picture book" → tag classification

Supports **recurring weekly anchor activities**: the host can set up a fixed weekly meetup (e.g. "every Wednesday 10:00, Stadspark sandbox") that others RSVP to.

### 4.3 Browse Activities (Website)

Activity list page `/activities`, mobile-first.

- **Filters**: date (today / this week / custom), age group (auto-highlights the user's child's group), area/location, activity-type tags
- **Sort**: by nearest date (default), or by distance
- **Activity card**: age group · time · title · host & headcount · area · tags · "I want to come" button

### 4.4 Join an Activity

The user taps "I want to come" → the bot notifies the host (with the joiner's child age + nickname). The host can leave a welcome message; participants are notified of new messages, and everyone in the activity can leave messages.

**Privacy rules:**
- Host and participants can see nicknames and messages
- Only participants and the host can add or edit messages

### 4.5 Smart Match

After a new activity is created, the system queries open activities in the same city and suggests similar ones to the creator.

**Match factors (decreasing weight):** time overlap (same day) > age-group match (same group preferred, adjacent group may be recommended) > location proximity (same area or <5km), activity-type similarity (sandbox ≈ playground, picture book ≈ library).

**Push-frequency control:** at most 3 match suggestions per activity; at most 2 pushes per day; users can turn recommendations off.

---

## 5. Platforms & Entry Points

### 5.1 WhatsApp Bot (main entry)

WhatsApp is the primary messaging tool in the Netherlands and supports message push natively.

**Tech choice: Baileys** (Node.js). It connects directly to the WhatsApp WebSocket protocol with no browser, using ~50–120MB of memory, so it runs on a 200MB small server. By contrast, whatsapp-web.js drives a headless Chromium via Puppeteer — Chromium alone needs 300–500MB and won't fit.

> ⚠️ Baileys is an unofficial library; it violates WhatsApp's ToS and the account can be banned. Use a dedicated number, don't mass-message strangers, and migrate to the official Business API (Meta Cloud / 360dialog) as we scale.

**Interaction model:** hybrid — natural-language understanding plus quick-reply buttons at key steps. Common actions: post an activity, view activities, cancel an activity, change the time, my activities, edit profile.

### 5.2 Website (browse entry)

**Tech choice: React (static) + TailwindCSS**, mobile-first.

| Page | Path | Purpose |
|------|------|---------|
| Home | `/` | Activity list + intro |
| Activities | `/activities` | Filtered browsing |
| Activity detail | `/activities/[id]` | Activity info + join |
| About | `/about` | Product intro + add the bot |

Design principles: clean, scannable activity cards; a prominent "I want to come" button; tapping it continues the flow in WhatsApp.

---

## 6. Technical Architecture

```
┌──────────────┐     ┌──────────────┐
│  WhatsApp    │     │   Website     │
│  Bot         │     │ (React static)│
│  (Baileys)   │     │               │
└──────┬───────┘     └──────┬────────┘
       │                    │
       ▼                    ▼
┌─────────────────────────────────┐
│          API Server (Rust)      │
│  ┌──────────┐  ┌───────────┐    │
│  │   NLU    │  │  Matching │    │
│  └──────────┘  └───────────┘    │
│  ┌──────────┐  ┌───────────┐    │
│  │ Location │  │   Notify  │    │
│  └──────────┘  └───────────┘    │
└──────────────┬──────────────────┘
               │
               ▼
          PostgreSQL
```

- **NLU** — calls an LLM to understand natural language and extract time / location / activity type
- **Matching** — similarity scoring on time + location + age group
- **Location library** — local Maastricht spots (prefilled common kid-friendly places)
- **Notify** — pushes to WhatsApp via Baileys

---

## 7. Maastricht Common Kid-Friendly Spots (prefilled)

| Spot | Area | Type | Ages |
|------|------|------|------|
| Stadspark | Centrum | Outdoor / sandbox | All ages |
| Bonnefantenpark | Randwyck | Outdoor / playground | 1–5 |
| Stadtbibliotheek | Centrum | Indoor / picture books | 0–5 |
| Geusseltbad | Noord | Indoor pool | 6m+ |
| Playzone Maastricht | Noord | Indoor play | 1–5 |
| Dierenpark Maastricht | Noord | Zoo | 1–5 |
| Frontenpark | Centrum | Outdoor walking | All ages |
| Sint Pietersberg | Zuid | Outdoor / caves | 3+ |

---

## 8. Open Questions

- [ ] Language priority — bilingual interface, or English-only to start?
    - English only
- [ ] Moderation — rely on invite-only + word-of-mouth, or build a formal mechanism?
  - landing page, people can share and scan QR code to register
- [ ] Business model — free, or freemium?
  - free for now

---

*Authored collaboratively by Ming & Hermes — a living document.*
