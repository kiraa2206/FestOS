// Read-only analysis layer. Raw rows are never mutated; every finding points back to source rows.
export type Row = Record<string, string>
export type Tables = Record<string, {cols: string[]; rows: Row[]}>
export type Sev = 'critical' | 'high' | 'medium' | 'info'
export type Kind = 'verified' | 'calculated' | 'assumption' | 'unresolved'
export interface Src {file: string; row: Row; calc?: Record<string, string>}
export interface Finding {id: string; title: string; module: string; severity: Sev; kind: Kind; summary: string; basis: string; assumptions?: string[]; sources: Src[]}
export interface Step {label: string; value: number; kind: Kind | 'stated'; basis: string}
export interface Health {file: string; rows: number; cols: number; blanks: {col: string; n: number}[]}
export const FILES = ['participants','registrations','contingents','events','venues','hostels','external_stays','inventory_logistics','inventory_merch','vendors','core_team']

export function parseCSV(text: string) {
  const t = text.replace(/^\uFEFF/, ''); const recs: string[][] = []; let f = '', r: string[] = [], q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true
    else if (c === ',') { r.push(f); f = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; r.push(f); f = ''; recs.push(r); r = [] }
    else f += c
  }
  if (f !== '' || r.length) { r.push(f); recs.push(r) }
  const cols = recs[0]
  const rows = recs.slice(1).filter(x => x.length > 1 || x[0] !== '').map((x, i) => {
    const o: Row = {'#': String(i + 2)}; cols.forEach((c, j) => { o[c] = x[j] ?? '' }); return o
  })
  return {cols, rows}
}
export async function loadAll(): Promise<Tables> {
  const T: Tables = {}
  for (const f of FILES) {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${f}.csv`)
    if (!res.ok) throw new Error(`Could not load ${f}.csv (HTTP ${res.status}). Check public/data/.`)
    T[f] = parseCSV(await res.text())
  }
  return T
}
const n = (s: string) => Number(s) || 0
const fmt = (x: number) => x.toLocaleString('en-IN')

export function analyse(T: Tables) {
  const p = T.participants.rows, g = T.registrations.rows, c = T.contingents.rows, e = T.events.rows
  const h = T.hostels.rows, x = T.external_stays.rows, v = T.vendors.rows, il = T.inventory_logistics.rows
  const im = T.inventory_merch.rows, team = T.core_team.rows
  const F: Finding[] = []
  const S = (file: string, rows: Row[], calc?: (r: Row) => Record<string, string>): Src[] => rows.map(row => ({file, row, calc: calc?.(row)}))
  const dups = p.filter(r => !/^P\d{4}$/.test(r.participant_id))
  const counts: Record<string, number> = {}; p.forEach(r => { counts[r.contingent_id] = (counts[r.contingent_id] || 0) + 1 })
  const declared = c.reduce((s, r) => s + n(r.strength_declared), 0)
  const cc = (r: Row) => ({counted_in_participants: String(counts[r.contingent_id] || 0), difference_vs_declared: String((counts[r.contingent_id] || 0) - n(r.strength_declared))})

  F.push({id: 'HC-1', title: 'Participant file does not match the ~2,400 expected headcount', module: 'Participants', severity: 'critical', kind: 'unresolved',
    summary: `participants.csv holds ${fmt(p.length)} rows against ~2,400 in the brief. Declared contingent strength sums to ${fmt(declared)}. The gap is not explained by anything in the data pack.`,
    basis: 'Row count of participants.csv; sum of strength_declared in contingents.csv; 2,400 is quoted from the problem statement, not from the data.',
    assumptions: ['Rows are counted as delivered. None were removed, merged or corrected.'], sources: S('contingents', c, cc)})
  const mism = c.filter(r => (counts[r.contingent_id] || 0) !== n(r.strength_declared))
  F.push({id: 'HC-2', title: `${mism.length} contingents differ from their declared strength`, module: 'Participants', severity: 'high', kind: 'calculated',
    summary: 'Counted participants per contingent differ from strength_declared. C02 and C03 are each +1, which is exactly the one flagged duplicate-looking record in each.',
    basis: 'Count of participants.csv rows grouped by contingent_id, compared with contingents.csv strength_declared.', sources: S('contingents', mism, cc)})
  const orig = p.filter(r => r.participant_id === 'P0119')
  F.push({id: 'DUP-1', title: 'Two records carry a P_DUP identifier', module: 'Participants', severity: 'high', kind: 'verified',
    summary: 'P_DUP01 and P_DUP02 use a non-standard ID. P_DUP02 matches P0119 (name, college, age, accessibility, arrival, departure) except the contact value, which is malformed. P_DUP01 has a placeholder-looking contact and no matching twin by name and college.',
    basis: 'ID pattern check (standard IDs are P + 4 digits). Field comparison against P0119 for P_DUP02.',
    assumptions: ['The P_DUP prefix is treated as a flag from the data pack, not proof of duplication. Both rows stay in the data.'], sources: [...S('participants', dups), ...S('participants', orig)]})
  const bad = p.filter(r => r.departure_datetime <= r.arrival_datetime)
  F.push({id: 'TIME-1', title: `${bad.length} participants depart before they arrive`, module: 'Participants', severity: 'high', kind: 'verified',
    summary: 'Arrival is on 2 Nov 02:00 while departure is earlier. Stay length cannot be derived for these rows.', basis: 'Direct comparison of arrival_datetime and departure_datetime strings (ISO format).', sources: S('participants', bad)})
  const out = p.filter(r => r.arrival_datetime < '2026-10-30 08:00' || r.departure_datetime > '2026-11-01 20:00')
  F.push({id: 'TIME-2', title: `${fmt(out.length)} stays begin before or end after the venue windows`, module: 'Participants', severity: 'info', kind: 'assumption',
    summary: 'Venue windows run 30 Oct 08:00 to 1 Nov 20:00. Many arrivals fall on 29 Oct and many departures on 2 to 3 Nov. This only matters for accommodation and check-in planning.',
    basis: 'String comparison of arrival and departure times against the first and last venue availability window.', assumptions: ['Venue windows are taken as the festival operating window.'], sources: S('participants', out)})
  const nights = ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']
  const req = p.filter(r => r.accommodation_requested === 'yes')
  const occ = nights.map(d => req.filter(r => r.arrival_datetime <= d + ' 23:00' && r.departure_datetime > d + ' 23:00').length)
  const hb = h.reduce((s, r) => s + n(r.capacity), 0), xb = x.reduce((s, r) => s + n(r.beds), 0), peak = Math.max(...occ)
  F.push({id: 'ACC-1', title: 'Bed demand at peak exceeds all hostel and external beds', module: 'Accommodation', severity: 'critical', kind: 'calculated',
    summary: `${fmt(req.length)} participants requested accommodation. Roughly ${fmt(peak)} are present on the busiest night against ${fmt(hb)} hostel and ${fmt(xb)} external beds (${fmt(hb + xb)} total), a shortfall of about ${fmt(Math.max(0, peak - hb - xb))} before gender or accessibility constraints.`,
    basis: `Participants with accommodation_requested = yes whose stay spans 23:00 on each night (29 Oct to 2 Nov: ${occ.join(', ')}). Supply is the sum of hostels.capacity and external_stays.beds.`,
    assumptions: ['One bed per requesting participant.', '23:00 is used as the overnight snapshot.', 'Room status, cleaning and gender rules are not applied yet.'], sources: S('external_stays', x, r => ({cost_per_bed_per_night: r.cost_per_bed_per_night}))})
  const ng = req.filter(r => r.gender_as_given !== 'Male' && r.gender_as_given !== 'Female')
  F.push({id: 'ACC-2', title: `${fmt(ng.length)} accommodation requests lack a binary gender value`, module: 'Accommodation', severity: 'high', kind: 'unresolved',
    summary: 'Hostels are listed only as boys or girls. These requests are Non-binary, Prefer not to say or blank. A blank is unknown, not a category.', basis: 'Filter on accommodation_requested = yes and gender_as_given not Male or Female.',
    assumptions: ['No gender is inferred for any row.'], sources: S('participants', ng)})
  const nr = p.filter(r => r.accessibility_needs !== 'None' && r.accessibility_needs !== '' && r.accommodation_requested === 'no')
  F.push({id: 'ACC-3', title: `${nr.length} participants declare an accessibility need but did not request accommodation`, module: 'Accommodation', severity: 'medium', kind: 'unresolved',
    summary: 'The files do not say whether these participants need a stay. They are not assumed to need or not need one.', basis: 'Filter on accessibility_needs not None and accommodation_requested = no.', sources: S('participants', nr)})
  const tg = g.filter(r => r.team_id !== ''), ty: Record<string, string> = {}; e.forEach(r => { ty[r.event_id] = r.type })
  const wt = (r: Row) => ({regs_with_team_id: String(g.filter(q => q.event_id === r.event_id && q.team_id).length), regs_without_team_id: String(g.filter(q => q.event_id === r.event_id && !q.team_id).length)})
  F.push({id: 'EVT-1', title: 'Event type labels contradict where team IDs appear', module: 'Events', severity: 'high', kind: 'calculated',
    summary: `All ${fmt(tg.length)} team_id values sit on events labelled solo, and no registration for an event labelled team has one. Teams are mostly size 1.`,
    basis: 'Registrations joined to events.type, grouped by whether team_id is filled.', assumptions: ['Neither label is trusted until the team rule is confirmed.'], sources: S('events', e, wt)})
  const exp = v.filter(r => r.hygiene_certificate_expiry < '2026-11-01')
  F.push({id: 'VND-1', title: `${exp.length} vendors have hygiene certificates that expire before or during the fest`, module: 'Vendors', severity: 'critical', kind: 'verified',
    summary: 'Certificates dated 29 Sep are already expired. Those dated 31 Oct lapse on the first full day.', basis: 'hygiene_certificate_expiry compared with the fest end date (1 Nov 2026).', assumptions: ['A certificate is valid through its expiry date.'],
    sources: S('vendors', exp, r => ({status: r.hygiene_certificate_expiry < '2026-10-30' ? 'expired before fest' : 'expires 31 Oct'}))})
  const vm = v.filter(r => ['vegan', 'jain', 'halal'].some(k => r.menu.toLowerCase().includes(k) && !r.dietary_options.toLowerCase().includes(k)))
  F.push({id: 'VND-2', title: 'Vendor menus and listed dietary options disagree', module: 'Vendors', severity: 'medium', kind: 'verified',
    summary: 'The menu names a dietary style that the dietary_options field does not list. Neither field is overridden.', basis: 'Keyword match of menu against dietary_options (vegan, jain, halal).', sources: S('vendors', vm)})
  const zero = Object.entries(il.reduce<Record<string, number>>((a, r) => { a[r.item] = (a[r.item] || 0) + (r.condition === 'good' ? n(r.quantity) : 0); return a }, {})).filter(([, q]) => q === 0).map(([k]) => k)
  const cam = e.filter(r => r.equipment_needs.includes('camera')).map(r => r.event_id)
  F.push({id: 'LOG-1', title: `No usable stock for: ${zero.join(', ')}`, module: 'Logistics', severity: 'high', kind: 'calculated',
    summary: `Every line for these items is under repair or needs check. ${cam.length} events (${cam.join(', ')}) list a camera as equipment.`, basis: 'Sum of quantity where condition = good, per item.',
    assumptions: ['"Needs check" is not counted as usable.'], sources: S('inventory_logistics', il.filter(r => zero.includes(r.item)))})
  const dem: Record<string, number> = {}; p.forEach(r => { dem[r.tshirt_size] = (dem[r.tshirt_size] || 0) + 1 })
  const sh = im.filter(r => r.item === 'T-shirt'), idc = im.filter(r => r.item === 'ID card')
  const short = sh.filter(r => (dem[r.size] || 0) > n(r.quantity) - n(r.reserved_quantity))
  F.push({id: 'MRC-1', title: 'Merchandise stock is below participant demand', module: 'Merchandise', severity: 'high', kind: 'calculated',
    summary: `T-shirt sizes ${short.map(r => r.size).join(', ')} fall short, and ${fmt(n(idc[0]?.quantity))} ID cards cover ${fmt(p.length)} participant rows.`, basis: 'Demand is the count of participants.tshirt_size per size. Available is quantity minus reserved_quantity.',
    assumptions: ['Every participant row receives one shirt in the size given.', 'Flagged duplicates are included in demand.'],
    sources: S('inventory_merch', [...short, ...idc], r => ({demand: r.item === 'T-shirt' ? String(dem[r.size] || 0) : String(p.length), available: String(n(r.quantity) - n(r.reserved_quantity))}))})
  const vol = e.reduce((s, r) => s + n(r.volunteers_needed), 0), vr = team.filter(r => r.role === 'Volunteer').length
  F.push({id: 'STF-1', title: 'Event volunteer asks far exceed the core team volunteer role', module: 'Staff', severity: 'medium', kind: 'assumption',
    summary: `Events ask for ${vol} volunteers in total; core_team lists ${vr} people with the Volunteer role.`, basis: 'Sum of volunteers_needed across events versus count of role = Volunteer.',
    assumptions: ['Volunteers may come from outside the core team. The data does not say.', 'Events are not assumed to run at the same time.'], sources: S('events', e)})
  const order: Sev[] = ['critical', 'high', 'medium', 'info']; F.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))

  const ladder: Step[] = [
    {label: 'Expected in the brief', value: 2400, kind: 'stated', basis: 'Quoted from the problem statement. Not present in any CSV.'},
    {label: 'Rows in participants.csv', value: p.length, kind: 'verified', basis: 'Row count of the file as delivered.'},
    {label: 'Rows without P_DUP IDs', value: p.length - dups.length, kind: 'calculated', basis: 'Rows whose ID is P plus four digits. The P_DUP rows are flagged, not removed.'},
    {label: 'Declared by contingents', value: declared, kind: 'calculated', basis: 'Sum of strength_declared in contingents.csv.'}]
  const health: Health[] = FILES.map(f => ({file: f, rows: T[f].rows.length, cols: T[f].cols.length, blanks: T[f].cols.map(col => ({col, n: T[f].rows.filter(r => r[col].trim() === '').length})).filter(b => b.n > 0)}))
  const assumptions = ['A blank field is unknown. It is never read as consent, gender, dietary clearance, eligibility or absence of need.', 'The literal text "None" in accessibility_needs is a stated value. A blank there is still unknown.',
    'Dates are naive local strings and are compared as ISO text.', 'Venue availability windows are treated as the festival operating window.', 'Row numbers refer to the CSV line in the original file (header is line 1).', 'Calculated figures state their basis. None are presented as confirmed facts.']
  return {F, ladder, health, assumptions}
}
