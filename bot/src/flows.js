// Conversation flows for the KidGo bot (PRD §4.1–4.4).
// Hybrid model: numbered quick-replies for menus + natural language for posting.
import { api } from './api.js'

// Per-user conversation state, keyed by phone. In-memory is fine for the pilot;
// move to Redis/DB when we run multiple bot instances.
const sessions = new Map()
const session = (phone) => {
  if (!sessions.has(phone)) sessions.set(phone, { step: 'idle', data: {} })
  return sessions.get(phone)
}

let groupsCache = null
const groups = async () => (groupsCache ||= await api.groups())

// Public website base, for the "manage" deep links we hand owners/participants.
const WEB_BASE = (process.env.KIDGO_WEB_BASE || 'https://kidgo.bryht.net').replace(/\/$/, '')

const MENU = [
  '🏡 *KidGo menu* — reply with a number:',
  '1️⃣ Post an activity',
  '2️⃣ Browse activities',
  '3️⃣ My activities',
  '4️⃣ My profile',
  '',
  'Or just type what you want to do, e.g. “Saturday 2pm sandbox at Stadspark”.',
].join('\n')

function fmtTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  })
}

function fmtActivity(a, i) {
  const n = i != null ? `${i + 1}. ` : ''
  return `${n}*${a.title}*\n   🗓️ ${fmtTime(a.when)} · 📍 ${a.spot.name} (${a.area})\n   👨‍👩‍👧 ${a.going.length}/${a.capacity} going`
}

/**
 * Handle one inbound text message.
 * @param {string} phone  digits-only WhatsApp id
 * @param {string} text   message body
 * @param {(t:string)=>Promise<void>} reply
 */
export async function handleMessage(phone, text, reply) {
  const s = session(phone)
  const msg = text.trim()
  const lower = msg.toLowerCase()

  // Global escape hatches.
  if (['menu', 'hi', 'hello', 'help', 'start'].includes(lower)) {
    s.step = 'idle'
  }
  if (lower === 'cancel') {
    s.step = 'idle'
    s.data = {}
    await reply('Okay, cancelled. ' + MENU)
    return
  }

  const user = await api.userByPhone(phone)

  // ---- Registration (PRD §4.1) ----
  if (!user) {
    return register(s, phone, msg, reply)
  }

  // Website "I want to come" deep-link (PRD §3.B): the prefilled message carries
  // a [ref:<activity-id>] token so we join the exact activity, no guessing.
  const ref = msg.match(/\[ref:\s*([0-9a-f-]{36})\]/i)
  if (ref) {
    return joinByRef(s, user, ref[1], reply)
  }

  // Website "get a fresh link" deep-link: an expired manage link sends the user
  // here with a [manage:<activity-id>] token so we re-issue a working one.
  const manage = msg.match(/\[manage:\s*([0-9a-f-]{36})\]/i)
  if (manage) {
    return manageByRef(s, user, manage[1], reply)
  }

  switch (s.step) {
    case 'post_sentence':
      return postFromSentence(s, user, msg, reply)
    case 'post_pick_spot':
      return postPickSpot(s, user, msg, reply)
    case 'post_confirm':
      return postConfirm(s, user, lower, reply)
    case 'browse_pick':
      return browsePick(s, user, msg, reply)
    default:
      return mainMenu(s, user, msg, lower, reply)
  }
}

// ---- registration ----

async function register(s, phone, msg, reply) {
  if (s.step !== 'reg_nickname' && s.step !== 'reg_stage') {
    s.step = 'reg_nickname'
    s.data = {}
    await reply("👋 Welcome to *KidGo*! Let's get you set up.\n\nHow should we call you?")
    return
  }
  if (s.step === 'reg_nickname') {
    s.data.nickname = msg
    s.step = 'reg_stage'
    const gs = await groups()
    const list = gs.map((g, i) => `${i + 1}. ${g.emoji} ${g.name} (${g.range})`).join('\n')
    await reply(
      `Nice to meet you, ${msg}! 🎉\n\nWhich stage(s) is your child in? You can pick more than one — reply with the numbers, e.g. *4* or *4,5*.\n${list}`,
    )
    return
  }
  // reg_stage — accept one or several stages (e.g. "4,5"); the first is the
  // child's primary stage, all of them become interests for matching/messages.
  const gs = await groups()
  const picks = parsePicks(msg, gs)
  if (!picks.length) {
    await reply('Please reply with one or more stage numbers, e.g. *4* or *4,5*.')
    return
  }
  const ids = picks.map((p) => p.id)
  const user = await api.upsertUser({
    nickname: s.data.nickname,
    phone,
    childStage: ids[0],
    interests: ids,
  })
  s.step = 'idle'
  s.data = {}
  const label = picks.map((p) => `${p.emoji} ${p.name}`).join(', ')
  const noun = picks.length > 1 ? 'stages' : 'stage'
  await reply(`All set, ${user.nickname}! 🍼 Your ${noun}: ${label}.\n\n${MENU}`)
}

// ---- main menu ----

async function mainMenu(s, user, msg, lower, reply) {
  if (lower === '1' || lower.startsWith('post')) {
    s.step = 'post_sentence'
    await reply('✍️ Describe your activity in one sentence:\n“Saturday 2pm, sandbox at Stadspark”')
    return
  }
  if (lower === '2' || lower.startsWith('browse')) {
    return browse(s, reply)
  }
  if (lower === '3' || lower.startsWith('mine') || lower.startsWith('my')) {
    const mine = await api.myActivities(user.id)
    if (!mine.length) return reply('You have no activities yet. Reply 1 to post one!')
    // Each activity gets a short manage link (/m/<code>). Opening it logs you in
    // for an hour so the website knows whether you're the host (edit/cancel/
    // message) or a participant (message) — no "I want to come" button.
    const { links } = await api.createLinks(user.id, mine.map((a) => a.id))
    const codeFor = new Map(links.map((l) => [l.activityId, l.code]))
    const body = mine
      .map((a, i) => {
        const code = codeFor.get(a.id)
        return code ? `${fmtActivity(a, i)}\n   🔧 Manage: ${WEB_BASE}/m/${code}` : fmtActivity(a, i)
      })
      .join('\n\n')
    return reply(`📋 *Your activities*\n\n${body}\n\n_Manage links expire in 1 hour — just ask for this list again to refresh them._`)
  }
  if (lower === '4' || lower.startsWith('profile')) {
    const gs = await groups()
    // Show every stage the parent follows (interests); fall back to childStage.
    const ids = user.interests?.length ? user.interests : [user.childStage].filter(Boolean)
    const stages = ids.map((id) => gs.find((x) => x.id === id)).filter(Boolean)
    const label = stages.length ? stages.map((g) => `${g.emoji} ${g.name}`).join(', ') : '—'
    const noun = stages.length > 1 ? 'Stages' : 'Stage'
    return reply(`👤 *${user.nickname}*\n📍 ${user.city}\n🧒 ${noun}: ${label}\n\n${MENU}`)
  }
  // Fall back to treating free text as an activity sentence — but only commit to
  // the posting flow if it actually looks like one (a day/time is detectable).
  // Otherwise plain chatter would silently drop the user into "Which spot?".
  if (msg.length > 6) {
    return postFromSentence(s, user, msg, reply, { fromMenu: true })
  }
  await reply(MENU)
}

// ---- posting (Scenario A) ----

async function postFromSentence(s, user, msg, reply, { fromMenu = false } = {}) {
  const parsed = await api.parse(msg)
  if (!parsed.when) {
    // No time found. From the explicit "post" flow, coach them; from free-text
    // chatter, don't hijack the conversation — just show the menu.
    if (fromMenu) {
      await reply("Sorry, I didn't quite get that.\n\n" + MENU)
      return
    }
    s.step = 'post_sentence'
    await reply('I couldn’t catch the day/time. Try e.g. “Saturday 2pm …” or type *cancel*.')
    return
  }
  s.data.draft = {
    when: parsed.when,
    spotId: parsed.spotId,
    tags: parsed.tags || [],
    title: parsed.title || undefined,
  }
  // When we inferred "posting" from free text, say so up front so it's not a
  // context-free jump.
  const lead = fromMenu ? '📝 Looks like you want to post an activity!\n\n' : ''
  if (!parsed.spotId) {
    return postPickSpotPrompt(s, reply, lead)
  }
  return showConfirm(s, reply, lead)
}

async function postPickSpotPrompt(s, reply, lead = '') {
  s.step = 'post_pick_spot'
  const spots = await api.spots()
  s.data.spots = spots
  const list = spots.map((sp, i) => `${i + 1}. ${sp.name} (${sp.area})`).join('\n')
  // Echo the day/time we understood so the spot question has context.
  await reply(
    `${lead}📅 ${fmtTime(s.data.draft.when)}\n\n📍 Where is it? Reply with a number (or *cancel*):\n${list}`,
  )
}

async function postPickSpot(s, user, msg, reply) {
  const spots = s.data.spots || (await api.spots())
  const idx = parseInt(msg, 10) - 1
  const spot = spots[idx]
  if (!spot) return reply('Please reply with a spot number from the list.')
  s.data.draft.spotId = spot.id
  return showConfirm(s, reply)
}

async function showConfirm(s, reply, lead = '') {
  const d = s.data.draft
  const spots = await api.spots()
  const spot = spots.find((x) => x.id === d.spotId)
  s.step = 'post_confirm'
  await reply(
    `${lead}Please confirm:\n\n📅 ${fmtTime(d.when)}\n📍 ${spot ? spot.name : d.spotId}\n🏷️ ${
      d.tags.length ? d.tags.join(', ') : '—'
    }\n\nReply *yes* to post, or *no* to discard.`,
  )
}

async function postConfirm(s, user, lower, reply) {
  if (lower !== 'yes' && lower !== 'y') {
    s.step = 'idle'
    s.data = {}
    await reply('Discarded. ' + MENU)
    return
  }
  const d = s.data.draft
  const a = await api.createActivity({
    hostId: user.id,
    spotId: d.spotId,
    when: d.when,
    tags: d.tags,
    title: d.title,
  })
  s.step = 'idle'
  s.data = {}
  await reply(`✅ Activity created!\n\n${fmtActivity(a)}\n\nI’ll let you know when someone joins!`)
}

// ---- browsing & joining (Scenario B/D) ----

async function browse(s, reply) {
  const list = await api.listActivities()
  if (!list.length) return reply('No upcoming activities yet. Reply 1 to post the first one!')
  s.data.browse = list
  s.step = 'browse_pick'
  await reply(
    '🔍 *Upcoming activities*\n\n' +
      list.map((a, i) => fmtActivity(a, i)).join('\n\n') +
      '\n\nReply with a number to join.',
  )
}

async function joinByRef(s, user, activityId, reply) {
  s.step = 'idle'
  s.data = {}
  const a = await api.activity(activityId)
  if (!a) {
    await reply("Hmm, I couldn't find that activity — it may have been removed. " + MENU)
    return
  }
  await api.join(a.id, user.id)
  await reply(`🎉 You're going to *${a.title}*!\n${fmtTime(a.when)} · ${a.spot.name}\n\nSee you there!`)
}

async function manageByRef(s, user, activityId, reply) {
  s.step = 'idle'
  s.data = {}
  const mine = await api.myActivities(user.id)
  const a = mine.find((x) => x.id === activityId)
  if (!a) {
    // Not one of theirs — either gone, or they never joined it.
    const exists = await api.activity(activityId)
    if (!exists) {
      await reply("Hmm, I couldn't find that activity — it may have been removed. " + MENU)
      return
    }
    await reply(
      `You haven't joined *${exists.title}* yet, so there's nothing to manage. Reply *2* to browse and join.`,
    )
    return
  }
  const { links } = await api.createLinks(user.id, [a.id])
  const code = links[0]?.code
  const role = a.host.id === user.id ? 'host' : 'going'
  await reply(
    `🔑 Fresh link for *${a.title}* (you're ${role}):\n${WEB_BASE}/m/${code}\n\n_Valid for 1 hour._`,
  )
}

async function browsePick(s, user, msg, reply) {
  const list = s.data.browse || []
  const idx = parseInt(msg, 10) - 1
  const a = list[idx]
  if (!a) {
    s.step = 'idle'
    return reply('Hmm, that wasn’t on the list. ' + MENU)
  }
  await api.join(a.id, user.id)
  s.step = 'idle'
  await reply(`🎉 You’re going to *${a.title}*!\n${fmtTime(a.when)} · ${a.spot.name}\n\nSee you there!`)
}

// ---- helpers ----

function parsePick(msg, list) {
  const n = parseInt(msg, 10)
  if (n >= 1 && n <= list.length) return list[n - 1]
  const lower = msg.toLowerCase()
  return list.find((g) => g.name.toLowerCase() === lower || g.id === lower) || null
}

// Parse one or several picks from a single reply, e.g. "4,5", "4 5", "4 and 5".
// Returns the matched items in order, de-duplicated.
function parsePicks(msg, list) {
  const tokens = msg
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t && t.toLowerCase() !== 'and')
  const picked = []
  for (const tok of tokens) {
    const p = parsePick(tok, list)
    if (p && !picked.includes(p)) picked.push(p)
  }
  return picked
}
