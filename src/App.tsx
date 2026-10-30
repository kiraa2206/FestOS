import {animate, motion, useInView, useReducedMotion} from 'framer-motion'
import {useEffect, useMemo, useRef, useState} from 'react'
import PerspectiveTunnel from './PerspectiveTunnel'
import {analyse, loadAll, type Finding, type Health, type Kind, type Sev, type Src, type Tables} from './engine'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {cn} from '@/lib/utils'

const KIND: Record<Kind | 'stated', string> = {verified: 'Verified in file', calculated: 'Calculated', assumption: 'Assumption', unresolved: 'Unresolved discrepancy', stated: 'Stated in brief'}
const SEV: Record<Sev, string> = {critical: 'Critical', high: 'High', medium: 'Medium', info: 'Info'}
const SEVC: Record<Sev, string> = {critical: 'bg-red-400', high: 'bg-amber-400', medium: 'bg-sky-300', info: 'bg-fg/40'}
const ACK = ['Noted, will review', 'Accepted as a known risk', 'Waiting on data from the team']
type Ack = {status: string; reason: string; at: string}
type Tab = 'overview' | 'findings' | 'files' | 'acks'
const f = (x: number) => x.toLocaleString('en-IN')
const panel = 'rounded-2xl border border-fg/10 bg-surface p-5 mb-4'
const field = 'w-full rounded-lg border border-fg/15 bg-bg px-3 py-2 text-sm'
const Tag = ({k}: {k: Kind | 'stated'}) => <Badge kind={k}>{KIND[k]}</Badge>

function Count({to}: {to: number}) {
  const ref = useRef<HTMLSpanElement>(null), on = useInView(ref, {once: true}), reduce = useReducedMotion(), [v, setV] = useState(0)
  useEffect(() => { if (!on) return; const c = animate(0, to, {duration: reduce ? 0 : 1.4, onUpdate: x => setV(Math.round(x))}); return () => c.stop() }, [on, to, reduce])
  return <span ref={ref}>{f(v)}</span>
}
function SourceTable({src, label}: {src: Src[]; label?: string}) {
  const [page, setPage] = useState(0), per = 15
  useEffect(() => setPage(0), [src])
  if (!src.length) return <p className="text-fg/50">No source rows.</p>
  const files = [...new Set(src.map(s => s.file))], cols = [...new Set(src.flatMap(s => Object.keys(s.row)))].filter(c => c !== '#'), cal = [...new Set(src.flatMap(s => Object.keys(s.calc || {})))]
  const pages = Math.ceil(src.length / per), th = 'sticky top-0 bg-surface2 px-3 py-2 text-left font-medium', td = 'whitespace-nowrap border-b border-fg/10 px-3 py-1.5'
  return <div className="mt-4"><p className="mb-2 text-sm"><b>{label || 'Source records'}</b> <span className="text-fg/50">{f(src.length)} rows from {files.map(x => x + '.csv').join(', ')}. Values are shown exactly as in the file.</span></p>
    <div className="max-h-[420px] overflow-auto rounded-lg border border-fg/10"><table className="w-full text-xs"><thead><tr>{files.length > 1 && <th className={th}>File</th>}<th className={th}>Line</th>{cols.map(c => <th key={c} className={th}>{c}</th>)}{cal.map(c => <th key={c} className={cn(th, 'text-amber-700 dark:text-amber-300')}>{c.replace(/_/g, ' ')} (calculated)</th>)}</tr></thead>
      <tbody>{src.slice(page * per, page * per + per).map((s, i) => <tr key={i}>{files.length > 1 && <td className={td}>{s.file}</td>}<td className={cn(td, 'text-fg/50')}>{s.row['#']}</td>
        {cols.map(c => <td key={c} className={td}>{s.row[c] === undefined ? '' : s.row[c] === '' ? <i className="text-red-600 dark:text-red-400">Not provided</i> : s.row[c]}</td>)}
        {cal.map(c => <td key={c} className={cn(td, 'bg-amber-300/10 text-amber-700 dark:text-amber-300')}>{s.calc?.[c] ?? ''}</td>)}</tr>)}</tbody></table></div>
    {pages > 1 && <div className="mt-3 flex items-center justify-center gap-4 text-sm"><Button variant="outline" size="sm" disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button>Page {page + 1} of {pages}<Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button></div>}</div>
}

export default function App() {
  const [T, setT] = useState<Tables | null>(null), [err, setErr] = useState(''), [tab, setTab] = useState<Tab>('overview'), [sel, setSel] = useState('')
  const [sev, setSev] = useState<Sev | ''>(''), [kind, setKind] = useState<Kind | ''>(''), [q, setQ] = useState('')
  const [acks, setAcks] = useState<Record<string, Ack>>({}), [status, setStatus] = useState(ACK[0]), [reason, setReason] = useState(''), [raw, setRaw] = useState('')
  useEffect(() => { loadAll().then(setT).catch(e => setErr(String(e.message || e))) }, [])
  const R = useMemo(() => (T ? analyse(T) : null), [T])
  if (err) return <main className="grid min-h-screen place-items-center bg-bg p-8 text-center text-fg"><div><h1 className="font-bold tracking-tight text-3xl">Data could not be loaded</h1><p className="text-fg/60">{err}</p></div></main>
  if (!T || !R) return <main className="grid min-h-screen place-items-center bg-bg p-8 text-center text-fg"><div><h1 className="font-bold tracking-tight text-3xl">Reading the data pack</h1><p className="text-fg/60">Parsing the CSV files in your browser.</p></div></main>
  const list = R.F.filter(x => (!sev || x.severity === sev) && (!kind || x.kind === kind) && (x.title + x.summary + x.module + x.id).toLowerCase().includes(q.toLowerCase()))
  const cur: Finding | undefined = R.F.find(x => x.id === sel)
  const enter = () => document.getElementById('desk')?.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'})
  const open = (id: string) => { setSel(id); setTab('findings'); setReason(''); enter() }
  const openFile = (x: string) => { setTab('files'); setRaw(x); enter() }
  const save = () => { if (!cur || reason.trim().length < 10) return; setAcks({...acks, [cur.id]: {status, reason: reason.trim(), at: new Date().toLocaleString('en-IN')}}); setReason('') }
  const sevN = (s: Sev) => R.F.filter(x => x.severity === s).length
  const tabs: [Tab, string][] = [['overview', 'Headcount'], ['findings', 'Findings'], ['files', 'Files'], ['acks', 'Acknowledgements']]
  const rowBtn = 'flex w-full items-start gap-3 border-t border-fg/10 px-2 py-3 text-left hover:bg-fg/5'

  return <div className="min-h-screen bg-bg font-sans text-fg">
    <div className="border-b border-accent/40 bg-accent/20 px-4 py-1.5 text-center text-xs text-fg/90">Demo build. Nothing in the CSVs is corrected or deleted here. Acknowledgements live in temporary browser memory and are not an audit log.</div>
    <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-fg/10 bg-bg/85 px-4 py-3 backdrop-blur sm:px-8">
      <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full border border-accent font-bold tracking-tight text-lg">F</span><div className="leading-tight"><b className="font-bold tracking-tight text-lg">FestOS</b><small className="block text-xs text-fg/50">Aarohan command center</small></div></div>
      <nav aria-label="Sections" className="flex flex-wrap gap-1">{tabs.map(([k, l]) => <button key={k} onClick={() => { setTab(k); enter() }} className={cn('rounded-full px-4 py-1.5 text-sm transition', tab === k ? 'bg-fg text-bg' : 'text-fg/60 hover:text-fg')}>{l}{k === 'acks' && Object.keys(acks).length ? ` (${Object.keys(acks).length})` : ''}</button>)}</nav>
      <Button onClick={() => open('HC-1')}>Open the headcount gap</Button></header>
    <PerspectiveTunnel files={R.health} onOpen={openFile} onEnter={enter}/>
    <main id="desk" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-10 sm:px-8">
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">{([['Rows in participants.csv', T.participants.rows.length], ['Registrations', T.registrations.rows.length], ['Findings', R.F.length], ['Critical findings', sevN('critical')]] as [string, number][]).map(([l, v]) =>
        <div key={l} className="border-l border-accent pl-4"><b className="block font-bold tracking-tight text-4xl sm:text-5xl"><Count to={v}/></b><span className="text-sm text-fg/60">{l}</span></div>)}</div>
      <h1 className="font-bold tracking-tight text-3xl sm:text-4xl">Data intake and reconciliation desk</h1><p className="mb-6 text-fg/60">Every figure is traced to rows in the data pack and labelled by how we know it.</p>
      <motion.div key={tab} initial={{opacity: 0, rotateX: -14, y: 30}} animate={{opacity: 1, rotateX: 0, y: 0}} transition={{duration: .55, ease: 'easeOut'}} style={{transformPerspective: 1400, transformOrigin: '50% 0%'}}>

      {tab === 'overview' && <>
        <section className={panel}><h2 className="font-bold tracking-tight text-2xl">Where the headcount stands</h2><p className="text-sm text-fg/60">The brief expects about 2,400 people. The pack says something different. Each number is shown with how it was obtained.</p>
          <div className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{R.ladder.map(s => <div key={s.label} className="rounded-xl bg-surface2 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{s.label}</b><Tag k={s.kind}/></div>
            <div className="my-2 h-1.5 rounded bg-bg"><div className="h-full rounded bg-accent" style={{width: `${(s.value / 3000) * 100}%`}}/></div><b className="font-bold tracking-tight text-3xl">{f(s.value)}</b><p className="mt-2 text-xs text-fg/50">{s.basis}</p></div>)}</div>
          <div className="rounded-xl border border-dashed border-red-400/70 p-4"><div className="flex flex-wrap items-center gap-2"><b>{f(R.ladder[1].value - R.ladder[0].value)} more rows than expected</b><Tag k="unresolved"/></div>
            <p className="my-2 text-sm">Calculated as rows in the file minus the brief figure. {f(R.ladder[2].value - R.ladder[0].value)} remain unexplained after setting aside the two P_DUP rows. No source in the pack explains them.</p><Button variant="outline" size="sm" onClick={() => open('HC-1')}>Open HC-1</Button></div></section>
        <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{(['critical', 'high', 'medium', 'info'] as Sev[]).map(s => <button key={s} onClick={() => { setSev(s); setTab('findings') }} className="rounded-2xl border border-fg/10 bg-surface p-4 text-left hover:border-fg/40"><span className={cn('mb-2 block h-2 w-8 rounded', SEVC[s])}/><b className="font-bold tracking-tight text-3xl">{sevN(s)}</b><span className="block text-sm text-fg/60">{SEV[s]}</span></button>)}</section>
        <section className={panel}><h2 className="mb-2 font-bold tracking-tight text-2xl">Needs a decision first</h2>{R.F.filter(x => x.severity === 'critical').map(x => <button key={x.id} className={rowBtn} onClick={() => open(x.id)}><span className={cn('mt-2 h-2.5 w-2.5 shrink-0 rounded-full', SEVC[x.severity])}/><span className="flex-1"><b className="block font-medium">{x.title}</b><small className="text-fg/50">{x.id} · {x.module}</small></span><Tag k={x.kind}/></button>)}</section>
        <section className={panel}><h2 className="mb-2 font-bold tracking-tight text-2xl">Assumptions in force</h2><ul className="list-disc space-y-1 pl-5 text-sm text-fg/80">{R.assumptions.map(a => <li key={a}>{a}</li>)}</ul></section></>}

      {tab === 'findings' && <div className="grid items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className={cn(panel, 'lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto')}><div className="mb-3 grid gap-2"><input className={field} placeholder="Search findings" value={q} onChange={e => setQ(e.target.value)} aria-label="Search findings"/>
          <select className={field} value={sev} onChange={e => setSev(e.target.value as Sev | '')} aria-label="Severity"><option value="">All severities</option>{(Object.keys(SEV) as Sev[]).map(s => <option key={s} value={s}>{SEV[s]}</option>)}</select>
          <select className={field} value={kind} onChange={e => setKind(e.target.value as Kind | '')} aria-label="Basis"><option value="">All bases</option>{(['verified', 'calculated', 'assumption', 'unresolved'] as Kind[]).map(k => <option key={k} value={k}>{KIND[k]}</option>)}</select></div>
          {!list.length && <p className="text-sm text-fg/50">No findings match. Clear a filter to see more.</p>}
          {list.map(x => <button key={x.id} className={cn(rowBtn, x.id === sel && 'bg-fg/10')} onClick={() => { setSel(x.id); setReason('') }}><span className={cn('mt-2 h-2.5 w-2.5 shrink-0 rounded-full', SEVC[x.severity])}/><span><b className="block font-medium">{x.title}</b><small className="text-fg/50">{x.id} · {x.module}{acks[x.id] ? ' · acknowledged' : ''}</small></span></button>)}</aside>
        <motion.article key={sel} initial={{opacity: 0, rotateY: -16}} animate={{opacity: 1, rotateY: 0}} transition={{duration: .5, ease: 'easeOut'}} style={{transformPerspective: 1400, transformOrigin: '0% 50%'}} className={cn(panel, 'min-w-0')}>{!cur ? <div className="py-12 text-center text-fg/50"><h2 className="font-bold tracking-tight text-2xl text-fg">Select a finding</h2><p>Pick one from the list to see its evidence, basis and source rows.</p></div> : <>
          <div className="flex flex-wrap items-center gap-2"><span className={cn('rounded px-2 py-0.5 text-xs font-semibold text-black', SEVC[cur.severity])}>{SEV[cur.severity]}</span><Tag k={cur.kind}/><small className="text-fg/50">{cur.id} · {cur.module}</small></div>
          <h2 className="mt-3 font-bold tracking-tight text-2xl">{cur.title}</h2><p className="mt-2 max-w-prose text-lg text-fg/85">{cur.summary}</p>
          <dl className="my-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[130px_1fr]"><dt className="text-fg/50">How we know</dt><dd>{cur.basis}</dd>{cur.assumptions && <><dt className="text-fg/50">Assumptions</dt><dd><ul className="list-disc pl-5">{cur.assumptions.map(a => <li key={a}>{a}</li>)}</ul></dd></>}</dl>
          <SourceTable src={cur.sources}/>
          <div className="mt-6 max-w-xl border-t border-fg/10 pt-4"><h3 className="font-bold tracking-tight text-xl">Acknowledge</h3><p className="text-sm text-fg/50">Temporary browser memory only. This is not an audit log and is lost on reload.</p>
            {acks[cur.id] && <div className="my-2 rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-800 dark:text-amber-200"><b>{acks[cur.id].status}</b> · {acks[cur.id].at}<br/>{acks[cur.id].reason}</div>}
            <select className={cn(field, 'mt-2')} value={status} onChange={e => setStatus(e.target.value)} aria-label="Acknowledgement type">{ACK.map(a => <option key={a}>{a}</option>)}</select>
            <textarea className={cn(field, 'my-2 min-h-20')} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (at least 10 characters)" aria-label="Reason"/>
            <Button disabled={reason.trim().length < 10} onClick={save}>Save acknowledgement</Button></div></>}</motion.article></div>}

      {tab === 'files' && <section className={panel}><h2 className="font-bold tracking-tight text-2xl">Files as delivered</h2><p className="text-sm text-fg/60">Counts come straight from each file. Blank cells are listed as not provided, never filled in.</p>
        <div className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{R.health.map(h => <div key={h.file} className="rounded-xl bg-surface2 p-4"><div className="flex flex-wrap justify-between gap-2"><b>{h.file}.csv</b><span className="text-xs text-fg/50">{f(h.rows)} rows · {h.cols} columns</span></div>
          {h.blanks.length ? <ul className="my-3 space-y-1.5 text-xs">{h.blanks.map(b => <li key={b.col} className="grid grid-cols-[1fr_60px_auto] items-center gap-2"><span>{b.col}</span><span className="h-1.5 rounded bg-bg"><span className="block h-full rounded bg-red-400" style={{width: `${(b.n / h.rows) * 100}%`}}/></span><span className="text-red-600 dark:text-red-400">{f(b.n)} not provided</span></li>)}</ul> : <p className="my-3 text-xs text-fg/50">No blank cells.</p>}
          <Button variant="outline" size="sm" onClick={() => setRaw(raw === h.file ? '' : h.file)}>{raw === h.file ? 'Hide raw rows' : 'View raw rows'}</Button></div>)}</div>
        {raw && <SourceTable label={`${raw}.csv`} src={T[raw].rows.map(row => ({file: raw, row}))}/>}</section>}

      {tab === 'acks' && <section className={panel}><h2 className="font-bold tracking-tight text-2xl">Acknowledgements</h2>
        <div className="my-3 rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-800 dark:text-amber-200">Temporary browser memory. These notes disappear on reload and are not a tamper-proof audit log. A permanent override ledger needs the backend.</div>
        {!Object.keys(acks).length ? <p className="text-fg/50">Nothing acknowledged yet. Open a finding to add one.</p> : Object.entries(acks).map(([id, a]) => <div key={id} className="border-t border-fg/10 py-3"><b>{id} · {R.F.find(x => x.id === id)?.title}</b><small className="block text-fg/50">{a.status} · {a.at}</small><p className="mt-1 text-sm">{a.reason}</p></div>)}
        {!!Object.keys(acks).length && <Button variant="outline" size="sm" onClick={() => setAcks({})}>Clear all</Button>}</section>}
      </motion.div>
    </main></div>
}
