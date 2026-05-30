// Mock activities for the prototype. Dates are anchored relative to "today"
// so the list always looks fresh when the prototype is opened.
const today = new Date()
today.setHours(0, 0, 0, 0)

const at = (dayOffset, hh, mm = 0) => {
  const d = new Date(today)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hh, mm, 0, 0)
  return d.toISOString()
}

export const ACTIVITIES = [
  {
    id: 'a1',
    title: 'Sandbox afternoon',
    group: 'toddler',
    spotId: 'stadspark',
    area: 'Centrum',
    tags: ['sandbox'],
    when: at(0, 14, 0),
    recurring: false,
    host: { name: 'Amy', child: '18 months', childGroup: 'toddler' },
    going: ['Amy', 'Beth'],
    capacity: 6,
    notes: 'Bring a little spade and a bucket — the big sandbox by the entrance.',
    messages: [
      { from: 'Amy', text: 'Welcome! We sit near the big oak tree 🌳', mine: true },
    ],
  },
  {
    id: 'a2',
    title: 'Picture-book corner',
    group: 'explorer',
    spotId: 'stadtbibliotheek',
    area: 'Centrum',
    tags: ['picture book'],
    when: at(1, 10, 0),
    recurring: false,
    host: { name: 'Dina', child: '9 months', childGroup: 'explorer' },
    going: ['Dina'],
    capacity: 5,
    notes: 'Quiet reading session in the kids wing. Soft mats, no shoes.',
    messages: [],
  },
  {
    id: 'a3',
    title: 'Weekly Wednesday sandbox',
    group: 'toddler',
    spotId: 'stadspark',
    area: 'Centrum',
    tags: ['sandbox', 'playground'],
    when: at(((3 - today.getDay() + 7) % 7) || 7, 10, 0),
    recurring: true,
    host: { name: 'Amy', child: '18 months', childGroup: 'toddler' },
    going: ['Amy', 'Cara', 'Mei'],
    capacity: 8,
    notes: 'Our standing weekly meetup — rain or shine (covered area if it rains).',
    messages: [
      { from: 'Amy', text: 'Same time as always, see you all 🙌', mine: true },
    ],
  },
  {
    id: 'a4',
    title: 'Splash & swim',
    group: 'creator',
    spotId: 'geusseltbad',
    area: 'Noord',
    tags: ['swimming'],
    when: at(2, 15, 30),
    recurring: false,
    host: { name: 'Lily', child: '4 years', childGroup: 'creator' },
    going: ['Lily', 'Noa'],
    capacity: 4,
    notes: 'Shallow pool. Bring swim diapers for the little ones.',
    messages: [],
  },
  {
    id: 'a5',
    title: 'Indoor play meetup',
    group: 'talker',
    spotId: 'playzone',
    area: 'Noord',
    tags: ['indoor play'],
    when: at(3, 9, 30),
    recurring: false,
    host: { name: 'Sara', child: '2.5 years', childGroup: 'talker' },
    going: ['Sara'],
    capacity: 6,
    notes: 'Soft-play zone on the ground floor. Coffee for grown-ups ☕',
    messages: [],
  },
  {
    id: 'a6',
    title: 'Zoo morning walk',
    group: 'creator',
    spotId: 'dierenpark',
    area: 'Noord',
    tags: ['zoo', 'walking'],
    when: at(5, 10, 0),
    recurring: false,
    host: { name: 'Mei', child: '3 years', childGroup: 'creator' },
    going: ['Mei', 'Amy', 'Lily'],
    capacity: 10,
    notes: 'Meet at the main gate. We loop the small-animals path first.',
    messages: [],
  },
  {
    id: 'a7',
    title: 'Park stroll & playground',
    group: 'newborn',
    spotId: 'frontenpark',
    area: 'Centrum',
    tags: ['walking'],
    when: at(1, 11, 0),
    recurring: false,
    host: { name: 'Joy', child: '3 months', childGroup: 'newborn' },
    going: ['Joy'],
    capacity: 5,
    notes: 'Gentle stroller walk for newborn parents — adult chat welcome 👶',
    messages: [],
  },
]

export const activityById = (id) => ACTIVITIES.find((a) => a.id === id)
