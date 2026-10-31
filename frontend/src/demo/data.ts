/**
 * Demodata för lärarvyn tills backend har API:erna (B2–B5).
 * Typerna här är tillfälliga. När API:erna finns ersätts de med
 * components["schemas"] från src/api/schema.d.ts och filen tas bort.
 */

export type TodayStatus = 'present' | 'absent' | 'pending'

export interface DemoClass {
  id: string
  name: string
}

export interface DemoStudent {
  id: string
  name: string
  classId: string
  today: TodayStatus
  attendancePercent: number
  workplace: { name: string; url?: string }
  projects: string[]
  reportCount: number
}

export interface DemoAnswer {
  question: string
  type: 'text' | 'images' | 'choice' | 'rating'
  text?: string
  images?: { caption: string }[]
  options?: string[]
  value?: string
  rating?: number
}

export interface DemoReport {
  id: string
  studentId: string
  week: number
  aplWeek: number
  submittedAt: string
  project: string
  read: boolean
  answers: DemoAnswer[]
}

export interface DemoThread {
  id: string
  studentId: string
  preview: string
  unread: number
}

export interface DemoAttention {
  studentId: string
  text: string
}

export const teacher = { name: 'Ingrid Svensson', firstName: 'Ingrid' }

export const classes: DemoClass[] = [
  { id: 'ee22', name: 'EE22' },
  { id: 'ee21', name: 'EE21' },
  { id: 'ee20', name: 'EE20' },
]

const names: Record<string, string[]> = {
  ee22: [
    'Hugo Karlsson', 'Elsa Lindqvist', 'Omar Haddad', 'Maja Nordström', 'Liam Berg', 'Alva Holm',
    'Noah Sandberg', 'Ebba Forsberg', 'William Öberg', 'Saga Lundgren', 'Elias Wikström', 'Wilma Eriksson',
    'Leo Andersson',
  ],
  ee21: [
    'Ella Nyström', 'Oscar Håkansson', 'Alice Sjöberg', 'Lucas Engström', 'Freja Lund', 'Adam Johansson',
    'Astrid Hedlund', 'Isak Strand', 'Selma Lindberg', 'Melvin Ek', 'Vera Axelsson', 'Theo Nilsson',
    'Agnes Persson', 'Viggo Sundqvist', 'Molly Björk',
  ],
  ee20: [
    'Albin Holmgren', 'Tyra Söderberg', 'Ludvig Sjögren', 'Nora Isaksson', 'Edvin Dahl', 'Signe Åberg',
    'Malte Jonsson', 'Juni Hellström', 'Arvid Blom', 'Stella Mattsson', 'Gustav Lindahl', 'Ines Falk',
  ],
}

// Antal frånvarande och ej incheckade per klass. Resten är incheckade.
const absentByClass: Record<string, number> = { ee22: 2, ee21: 2, ee20: 2 }
const pendingByClass: Record<string, number> = { ee22: 1, ee21: 2, ee20: 2 }

const workplaces = [
  { name: 'Gtkonsult', url: 'https://gtkonsult.se' },
  { name: 'Umeå Elteknik AB' },
  { name: 'Norrlands Elservice' },
  { name: 'Vännäs El & Data' },
  { name: 'Kramfors Installation AB' },
]

const projectPool = ['Hemsida', 'SQL koppling', 'Belysning nybygge', 'Elcentral', 'Laddbox', 'Fiberanslutning']

function slug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, '-')
}

export const students: DemoStudent[] = classes.flatMap((cls) =>
  names[cls.id].map((name, i) => {
    const total = names[cls.id].length
    const today: TodayStatus =
      i < absentByClass[cls.id] ? 'absent' : i >= total - pendingByClass[cls.id] ? 'pending' : 'present'
    const isHugo = name === 'Hugo Karlsson'
    return {
      id: slug(name),
      name,
      classId: cls.id,
      today,
      attendancePercent: isHugo ? 82 : 78 + ((i * 7 + cls.id.length * 3) % 22),
      workplace: isHugo ? workplaces[0] : workplaces[(i % 4) + 1],
      projects: isHugo ? ['Hemsida', 'SQL koppling'] : [projectPool[(i + 2) % projectPool.length]],
      reportCount: 8 + ((i * 5) % 18),
    }
  }),
)

export function studentById(id: string) {
  return students.find((s) => s.id === id)
}

export function classById(id: string) {
  return classes.find((c) => c.id === id)
}

export function studentsInClass(classId: string) {
  return students.filter((s) => s.classId === classId)
}

export function attendanceToday(list: DemoStudent[] = students) {
  return {
    total: list.length,
    present: list.filter((s) => s.today === 'present').length,
    absent: list.filter((s) => s.today === 'absent').length,
  }
}

export const attention: DemoAttention[] = [
  { studentId: 'hugo-karlsson', text: 'Upprepad frånvaro: 3 frånvarodagar denna period, ej anmäld i dag' },
  { studentId: 'elsa-lindqvist', text: 'Har inte lämnat redovisning två veckor i rad' },
  { studentId: 'oscar-hakansson', text: 'Handledaren har inte bekräftat närvaron för förra veckan' },
  { studentId: 'albin-holmgren', text: 'Utbildningskontraktet saknar handledarens underskrift' },
]

const textAnswers = [
  'Drog kabel i ett nybygge och fick hjälpa till att koppla in belysning.',
  'Monterade en elcentral tillsammans med handledaren och mätte isolationsresistans.',
  'Installerade en laddbox i ett garage och gick igenom egenkontrollen efteråt.',
]

export const reports: DemoReport[] = [
  {
    id: 'r-hugo-42',
    studentId: 'hugo-karlsson',
    week: 42,
    aplWeek: 2,
    submittedAt: 'I dag 08:12',
    project: 'Hemsida',
    read: false,
    answers: [
      { question: 'Har du bilder att visa?', type: 'images', images: [{ caption: 'Startsidan i mobil' }, { caption: 'Databasschema' }] },
      {
        question: 'Vad har du gjort den här veckan?',
        type: 'text',
        text: 'Jag har byggt klart startsidan och kopplat kontaktformuläret till databasen. Handledaren gick igenom hur man skriver säkra SQL-frågor och vi testade formuläret på mobil och dator. På fredag fick jag visa sidan för kunden, som ville ha större bilder i toppen.',
      },
      { question: 'Har du jobbat något med HTML?', type: 'choice', options: ['Ja', 'Nej', 'Vet inte'], value: 'Ja' },
      { question: 'Hur svårt anser du att projektet varit?', type: 'rating', rating: 3 },
    ],
  },
  ...['omar-haddad', 'ella-nystrom', 'tyra-soderberg'].map((studentId, i) => ({
    id: `r-${studentId}-42`,
    studentId,
    week: 42,
    aplWeek: 2,
    submittedAt: i === 0 ? 'I dag 07:48' : i === 1 ? 'I går 16:30' : 'I går 15:05',
    project: studentById(studentId)?.projects[0] ?? 'Projekt',
    read: false,
    answers: [
      { question: 'Vad har du gjort den här veckan?', type: 'text' as const, text: textAnswers[i] },
      { question: 'Vad vill du bli bättre på nästa vecka?', type: 'text' as const, text: 'Läsa ritningar snabbare och planera arbetet själv innan vi börjar.' },
      { question: 'Har du bilder att visa?', type: 'images' as const, images: [{ caption: 'Från arbetsplatsen' }] },
      { question: 'Hur svårt anser du att arbetet varit?', type: 'rating' as const, rating: 2 + i },
    ],
  })),
]

export function reportById(id: string) {
  return reports.find((r) => r.id === id)
}

export const threads: DemoThread[] = [
  { id: 't1', studentId: 'hugo-karlsson', preview: 'Hej igen, är det okej om jag går tidigare på fredag? Handledaren har sagt ja.', unread: 1 },
  { id: 't2', studentId: 'maja-nordstrom', preview: 'Jag har laddat upp bilderna från elcentralen nu.', unread: 2 },
  { id: 't3', studentId: 'adam-johansson', preview: 'Tack! Då ses vi på trepartssamtalet på torsdag.', unread: 0 },
  { id: 't4', studentId: 'nora-isaksson', preview: 'Var hittar jag mitt utbildningskontrakt?', unread: 3 },
]

export const unreadMessages = threads.reduce((sum, t) => sum + t.unread, 0)
export const unreadReports = reports.filter((r) => !r.read).length
export const contractsToSign = 2
