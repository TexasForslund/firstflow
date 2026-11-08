/**
 * Förklaringar till begrepp som är lätta att gissa fel på (Texas, 2026-10-31).
 * Två–tre meningar och ett exempel. Använd orden i docs/ordlista.md.
 */
export const HELP = {
  goals: {
    title: 'Mål',
    body: 'Ett mål är något eleven ska visa under APL. Klassens mål kommer från läroplanen. Skolans egna mål, till exempel Kundkontakt, finns kvar utan koppling. När eleven svarar på en fråga som är kopplad till ett mål blir svaret underlag.',
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
  missingCheckIn: {
    title: 'Ingen incheckning',
    body: 'En APL-dag utan incheckning räknas som frånvaro. Du behöver inte göra något. Glömde eleven checka in fast hen var här, lägg till dagen med Var här en dag.',
    example:
      'Oscar var på plats i onsdags men glömde checka in. Du trycker Var här en dag och väljer onsdag, så räknas dagen som närvaro.',
  },
  lateAndMissing: {
    title: 'Sena och saknade redovisningar',
    body: 'En redovisning är sen när eleven skickar in den efter redovisningsdagen. Saknas betyder att eleven inte har redovisat en redovisningsdag. Eleven kan redovisa i efterhand upp till fyra veckor, så Saknas visar fyra veckor bakåt.',
    example:
      'Klassen redovisar tisdag och fredag. Skickar Omar in tisdagens redovisning på onsdag är den sen. Har han inte skickat in fredagens syns den under Saknas.',
  },
  logic: {
    title: 'Logik',
    body: 'Med en regel kan svaret på en fråga hoppa till en senare fråga. Utan regler får eleven frågorna i ordning. Frågan som regeln leder till blir en följdfråga.',
    example:
      'Har du haft kundkontakt i dag? Ja går till ”Vad gjorde du?”. Nej hoppar över den och går till nästa fråga.',
  },
  notes: {
    title: 'Anteckningar',
    body: 'Skriv det du vill att läraren vet om eleven i stort, som Beröm, Oro eller Övrigt. Bara elevens lärare ser anteckningen, aldrig eleven. Du kan ändra eller ta bort den i 24 timmar.',
    example: 'Oro: ”Hugo har kommit 30 minuter sent tre dagar i rad.”',
  },
  contractSigning: {
    title: 'Signering',
    body: 'Läraren signerar för skolan när kontraktet skickas. Sedan signerar eleven och handledaren, i valfri ordning. När alla har signerat får läraren en notis och alla kan ladda ner kontraktet.',
    example:
      'Läraren skickar Hugos kontrakt på måndag. Hugo signerar samma dag och handledaren Gustav på tisdag. Då är kontraktet klart.',
  },
  projectCompleted: {
    title: 'Avslutat projekt',
    body: 'Eleverna ser inte längre projektet under Min APL och kan inte koppla nya redovisningar till det. Redovisningar och mål som redan finns sparas. Du kan öppna projektet igen när som helst.',
    example:
      'Projektet Laddbox för elbil är klart i december. Du avslutar det, men tabellen Mål i projektet finns kvar.',
  },
  attendanceWeek: {
    title: 'Närvaron',
    body: 'Eleven checkar in i appen varje APL-dag. Handledaren bekräftar sedan att eleven var på plats. En APL-dag utan incheckning räknas som frånvaro.',
    example:
      'Hugo checkar in 07:35 och handledaren bekräftar på kvällen, så dagen blir bekräftad. Checkar Omar inte in på tisdagen räknas tisdagen som frånvaro.',
  },
  remindSupervisors: {
    title: 'Väntar på handledaren',
    body: 'Incheckningar som handledaren inte har bekräftat än. Påminn handledarna skickar en notis till varje handledare som har dagar kvar att bekräfta de senaste två veckorna.',
    example:
      'Gustav har tre dagar kvar. Du trycker Påminn, och han får notisen ”Ingrid påminner dig om att bekräfta närvaron, 3 dagar väntar”.',
  },
  attendanceLegend: {
    title: 'Färgerna',
    body: 'Varje ring visar en APL-dag. En blå ring med röd prick betyder att eleven checkade in men att handledaren säger att eleven inte var på plats. Prata då med eleven och handledaren.',
    example:
      'Liam checkade in 07:40 på torsdagen, men Gustav svarade Inte på plats. Ringen får en röd prick, så att du ser att något behöver redas ut.',
  },
  sharedCompany: {
    title: 'En profil för alla skolor',
    body: 'Företaget har en profil som alla skolor med elever här ser: namn, adress och handledare. Varje skola ser bara sina egna elever. Bjuder en ny skola in er, läggs den till här.',
    example:
      'Umeåskolan bjuder in Gustav. Han tackar ja, och Umeåskolan ser samma profil som Kramforsskolan, men inte Kramforsskolans elever.',
  },
  importTemplate: {
    title: 'Mallen',
    body: 'Mallen följer SS 12000, standarden för skolsystem i Sverige. Exportera från skolans system eller fyll i för hand. Personnummer, adress och vårdnadshavare behövs inte och ska inte vara med.',
    example:
      'En export från skolans system har ofta fler kolumner, t.ex. telefon. Firstflow läser bara kolumnerna i mallen och hoppar över resten.',
  },
  importClasses: {
    title: 'Klasser med APL',
    body: 'Firstflow ska bara ha uppgifter om elever som gör APL. Elever i andra klasser hämtas inte, även om de finns i filen. Lärare tas med om de undervisar i en vald klass, SYV och rektor alltid.',
    example: 'Skolan väljer EL23 och EE22. Eleverna i NA23 och SA23 hoppas över.',
  },
  importLeaving: {
    title: 'Lämnar klassen',
    body: 'Eleven finns i klassen i Firstflow men inte i filen. Kopplingen till klassen tas bort. Redovisningar och närvaro sparas som vanligt.',
    example:
      'Liam har bytt till en klass utan APL. Han försvinner från EL23 i Firstflow, men hans redovisningar finns kvar.',
  },
  importInvite: {
    title: 'Inbjudan',
    body: 'Varje ny person får ett mejl med en länk och väljer sitt eget lösenord. Länken gäller i 14 dagar och kan bara användas en gång. Inga lösenord står i filen.',
    example:
      'Hugo får mejlet ”Välkommen till Firstflow”, klickar på länken och väljer ett lösenord. Sedan är han inloggad.',
  },
  // Läroplanen (idé 13, Texas 2026-11-08). Varje text säger vad valet styr längre fram.
  curriculum: {
    title: 'Läroplan och program',
    body: 'Klassen följer Gy25 eller Gy11 och ett program hos Skolverket. Det avgör vilka ämnen du kan välja. Därifrån kommer målen, som sedan används i frågor, projekt och underlag inför betyg.',
    example:
      'EL25 läser Gy25 på El- och energiprogrammet. Då föreslås ämnen som Elteknik och Ellära, och målen hämtas ur deras centrala innehåll.',
  },
  orientations: {
    title: 'Inriktningar och Skolverket',
    body: 'Koppla klassens inriktningar till Skolverkets inriktningar. Då föreslås ämnena för den inriktningen också. Inriktningen styr fortfarande vilka frågor eleverna får.',
    example:
      'Klassens inriktning El kopplas till Elteknik. Då kryssas Installationsteknik i, och eleverna på El kan få egna frågor.',
  },
  subjects: {
    title: 'Ämnen under APL',
    body: 'Välj de ämnen eleverna tränar på APL, inte alla ämnen de läser. Bara de valda ämnena får mål. Du kan ändra valet senare.',
    example: 'EL23 tränar Elteknik och Installationsteknik på APL men inte Matematik. Därför väljer du bara de två.',
  },
  curriculumGoals: {
    title: 'Mål från läroplanen',
    body: 'Varje mål är en punkt i ämnets centrala innehåll, med ett kort namn. Målen används i frågorna och projekten. Elevens svar blir underlag, som syns på elevsidan och i Underlag inför betyg.',
    example:
      'Punkten om ritningar blir målet Ritningsläsning. Frågan ”Har du läst en ritning i dag?” kopplas till målet, och Hugos svar blir underlag.',
  },
  goalQuestions: {
    title: 'Frågor från målen',
    body: 'Färdiga frågor där svaret redan är kopplat till ett mål. När eleven svarar Ja eller beskriver vad hen gjort räknas det som underlag för målet.',
    example:
      'Frågan ”Har du arbetat med elsäkerhet i dag?” är kopplad till målet Elsäkerhet. Svarar Maja Ja syns det under Elsäkerhet på hennes elevsida.',
  },
  projectGoals: {
    title: 'Mål i projektet',
    body: 'Välj de mål eleverna tränar i projektet. Redovisningarna i projektet visar sedan vilka mål eleven har underlag för. När projektet är klart väljer eleven själv vilka mål hen visade.',
    example:
      'Projektet Laddbox för elbil har målen Ansluta apparater och Elsäkerhet. Alva ser dem i sitt projekt och kryssar i dem i sammanfattningen.',
  },
} as const

export type HelpTopic = keyof typeof HELP
