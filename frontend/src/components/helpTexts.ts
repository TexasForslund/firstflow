/**
 * Förklaringar till begrepp som är lätta att gissa fel på (Texas, 2026-10-31).
 * Två–tre meningar och ett exempel. Använd orden i docs/ordlista.md.
 */
export const HELP = {
  goals: {
    title: 'Mål',
    body: 'Ett mål är något eleven ska visa under APL. Målen är gemensamma för skolan och kan kopplas till läroplanen. När eleven svarar på en fråga som är kopplad till ett mål blir svaret underlag.',
    example:
      'Svarar Hugo Ja på ”Har du haft kundkontakt i dag?” räknas det för målet Kundkontakt, med hans svar på följdfrågan.',
  },
  tracks: {
    title: 'Inriktningar',
    body: 'Dela in klassen i inriktningar när olika elever ska få olika frågor. Varje elev har en inriktning. Frågor utan inriktning går till alla.',
    example:
      'EE-klassen har Dator och Programmering. Frågan ”Vilket språk programmerade du i?” visas bara för eleverna på Programmering.',
  },
  aplDays: {
    title: 'APL-dagar',
    body: 'De veckodagar klassen är på APL. Eleverna checkar in de dagarna, och bara de räknas i närvaron. Redovisningsdagarna väljs bland APL-dagarna.',
    example: 'APL måndag–torsdag och redovisning onsdag och torsdag. Fredag räknas inte som frånvaro.',
  },
  privateComment: {
    title: 'Privat kommentar',
    body: 'En privat kommentar ser bara lärare och handledare. Eleven ser den inte och får ingen notis.',
    example: 'Handledaren skriver till läraren: ”Hugo gick vid lunch i tisdags, så hela dagen stämmer inte.”',
  },
} as const

export type HelpTopic = keyof typeof HELP
