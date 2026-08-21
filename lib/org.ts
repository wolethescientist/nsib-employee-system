// How the bureau is actually organised, and where a member of staff sits in it.
//
// The workbook was filled in sheet by sheet over years, so the same directorate
// is spelled four ways ("Traansport Investigation", "Investigation", "Technical
// Investigation", "DTI"). The Director's correction at the review was that there
// are five directorates and no others — "technical investigation" and "transport
// investigation" are the same thing, and Operations does not exist.

/** The five directorates, as the Director General listed them. */
export const DIRECTORATES = [
  'CEO',
  'Directorate of Transport Investigation',
  'Directorate of Technical Services',
  'Transport Safety Lab',
  'Material Lab',
] as const

export type Directorate = (typeof DIRECTORATES)[number]

/** Short forms the bureau speaks in: DTI, DTS. */
export const DIRECTORATE_ABBREVIATION: Record<string, string> = {
  CEO: 'CEO',
  'Directorate of Transport Investigation': 'DTI',
  'Directorate of Technical Services': 'DTS',
  'Transport Safety Lab': 'TSL',
  'Material Lab': 'ML',
}

/** What a directorate that is not one of the five reads as. */
export const UNASSIGNED = 'Unassigned'

// Everything on the left maps onto one of the five. Matched on a squashed,
// lower-cased form of the recorded value, so spacing and punctuation do not
// matter. Deliberately conservative: "Operations" and "Special duties" are NOT
// here — the Director removed Operations without saying where those people go,
// and guessing would put real staff in the wrong directorate.
const ALIASES: Record<string, Directorate> = {
  ceo: 'CEO',
  dg: 'CEO',
  officeoftheceo: 'CEO',
  officeofthedg: 'CEO',

  dti: 'Directorate of Transport Investigation',
  investigation: 'Directorate of Transport Investigation',
  transportinvestigation: 'Directorate of Transport Investigation',
  traansportinvestigation: 'Directorate of Transport Investigation',
  // The Director: "technical investigation, transport investigation — they are
  // all the same to you."
  technicalinvestigation: 'Directorate of Transport Investigation',
  directorateoftransportinvestigation: 'Directorate of Transport Investigation',
  directorateoftransportinvestigations: 'Directorate of Transport Investigation',

  dts: 'Directorate of Technical Services',
  technical: 'Directorate of Technical Services',
  technicalservices: 'Directorate of Technical Services',
  directorateoftechnicalservices: 'Directorate of Technical Services',

  safetylab: 'Transport Safety Lab',
  transportsafetylab: 'Transport Safety Lab',
  tsl: 'Transport Safety Lab',

  materiallab: 'Material Lab',
  materialslab: 'Material Lab',
  ml: 'Material Lab',
}

const squash = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '')

/** The canonical directorate for a recorded value, or null if it is not one of the five. */
export function normaliseDirectorate(value?: string | null): Directorate | null {
  const key = squash(String(value ?? ''))
  if (!key) return null
  return ALIASES[key] ?? (DIRECTORATES.find(name => squash(name) === key) as Directorate | undefined) ?? null
}

/** What to show: the canonical name, or "Unassigned" for anything else. */
export const directorateLabel = (value?: string | null): string => normaliseDirectorate(value) ?? UNASSIGNED

/**
 * Civil service hierarchy. The Director's point: a register sorted A→Z buries a
 * Director in the middle of the investigators. The DG sits at the top, then
 * directors, then everyone else, with trainees last.
 *
 * Ranks are read from the designation the workbook already records, so nothing
 * new has to be keyed in for the ordering to be right.
 */
export const HIERARCHY_BANDS = [
  { rank: 0, label: 'Director General' },
  { rank: 1, label: 'Directors' },
  { rank: 2, label: 'Deputy Directors' },
  { rank: 3, label: 'General Managers' },
  { rank: 4, label: 'Managers and Heads of Unit' },
  { rank: 5, label: 'Senior Investigators' },
  { rank: 6, label: 'Investigators' },
  { rank: 7, label: 'Trainees' },
  { rank: 8, label: 'Other staff' },
] as const

export const bandLabel = (rank: number) => HIERARCHY_BANDS.find(band => band.rank === rank)?.label ?? 'Other staff'

/**
 * Seniority from designation and personnel level. Order of the tests matters:
 * "Investigator Trainee" is a trainee, and "Deputy Director" is not a director.
 * `ge\w*ral` is deliberate — the register spells it "Director Geenral".
 */
export function rankOf(designation?: string | null, personnelLevel?: string | null): number {
  const text = `${designation ?? ''} ${personnelLevel ?? ''}`.toLowerCase()
  if (!text.trim()) return 8
  if (/director\s*ge\w*ral|\bdg\b|chief executive/.test(text)) return 0
  if (/deputy\s+director|\bdd\b/.test(text)) return 2
  if (/\bdirector\b|\bdirectorate head\b/.test(text)) return 1
  if (/general manager|^gm|\bgm[a-z]{1,3}\b/.test(text)) return 3
  if (/head of unit|\bmanager\b|\bchief\b|principal/.test(text)) return 4
  // `train+ee` on purpose: the register holds "Trainnee Investigator".
  if (/train+ee|pupil|\bintern\b/.test(text)) return 7
  if (/senior\s+(safety\s+)?investigator/.test(text)) return 5
  if (/investigator|\basi\b|\bsi\b/.test(text)) return 6
  return 8
}

export type RankedPerson = { name: string; designation?: string | null; personnelLevel?: string | null }

/** Rank first, then alphabetically inside a rank. */
export function compareByHierarchy(a: RankedPerson, b: RankedPerson): number {
  const difference = rankOf(a.designation, a.personnelLevel) - rankOf(b.designation, b.personnelLevel)
  return difference || a.name.localeCompare(b.name)
}

/** The register grouped into its bands, seniors first, empty bands dropped. */
export function groupByHierarchy<T extends RankedPerson>(people: T[]): { rank: number; label: string; people: T[] }[] {
  const bands = new Map<number, T[]>()
  for (const person of people) {
    const rank = rankOf(person.designation, person.personnelLevel)
    bands.set(rank, [...(bands.get(rank) || []), person])
  }
  return Array.from(bands.keys())
    .sort((a, b) => a - b)
    .map(rank => ({ rank, label: bandLabel(rank), people: bands.get(rank)!.sort((a, b) => a.name.localeCompare(b.name)) }))
}
