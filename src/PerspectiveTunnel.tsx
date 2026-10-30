import {motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue} from 'framer-motion'
import {useEffect, useState} from 'react'
import type {Health} from './engine'
import {Button} from '@/components/ui/button'

// Photos are decorative stock imagery (Unsplash). If one fails to load the card falls back to a plain face; the data on it is always real.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=640&q=70`
const PHOTOS = ['1492684223066-81342ee5ff30', '1459749411175-04bf5292ceea', '1470229722913-7c0e2dbbafd3', '1501281668745-f7f57925c3b4', '1514525253161-7a46d19cd819', '1523580494863-6f3031224c94', '1540575467063-178a50c2df87', '1511578314322-379afb476865', '1429962714451-bb934ecdc4ec', '1506157786151-b8491531f063', '1533174072545-7a4b6ad7a6c3'].map(U)
const f = (x: number) => x.toLocaleString('en-IN')
const clamp = (v: number) => Math.min(1, Math.max(0, v))
type Stage = {w: number; h: number; mobile: boolean}
type Pointer = {x: MotionValue<number>; y: MotionValue<number>}

function useParallax(on: boolean): Pointer {
  const rx = useMotionValue(0), ry = useMotionValue(0), cfg = {stiffness: 60, damping: 25, mass: 0.5}
  const x = useSpring(rx, cfg), y = useSpring(ry, cfg)
  useEffect(() => {
    if (!on) return
    const m = (e: PointerEvent) => { rx.set((e.clientX / innerWidth - 0.5) * 2); ry.set((e.clientY / innerHeight - 0.5) * 2) }
    addEventListener('pointermove', m, {passive: true}); return () => removeEventListener('pointermove', m)
  }, [on, rx, ry])
  return {x, y}
}

function Card({h, i, total, progress, pointer, stage, onOpen}: {h: Health; i: number; total: number; progress: MotionValue<number>; pointer: Pointer; stage: Stage; onOpen: (file: string) => void}) {
  const [bad, setBad] = useState(false)
  const span = 0.55, start = (i / total) * (1 - span)
  const local = useTransform(progress, [start, start + span], [0, 1])
  const z = useTransform(local, [0, 1], [stage.mobile ? -1200 : -1700, stage.mobile ? 340 : 480])
  const opacity = useTransform(local, [0, 0.18, 0.82, 0.98], [0, 1, 1, 0])
  const a = i * 137.5 * Math.PI / 180, bx = Math.cos(a) * stage.w * (0.28 + (i % 3) * 0.08), by = Math.sin(a) * stage.h * (0.26 + (i % 2) * 0.09)
  const pan = stage.mobile ? 20 : 45, rot = (i % 2 ? -1 : 1) * (3 + (i % 5) * 2)
  const transform = useTransform([z, pointer.x, pointer.y], ([cz, px, py]: number[]) => `translate3d(calc(-50% + ${bx - px * pan}px), calc(-50% + ${by - py * pan}px), ${cz}px) rotateZ(${rot}deg)`)
  const w = stage.mobile ? Math.max(130, Math.min(180, stage.w * 0.38)) : Math.max(180, Math.min(270, stage.w * 0.18))
  return <motion.button onClick={() => onOpen(h.file)} aria-label={`Open raw rows of ${h.file}.csv`} style={{width: w, transform, opacity, zIndex: i + 1}} className="group pointer-events-auto absolute left-1/2 top-1/2 aspect-[4/5] cursor-pointer select-none will-change-transform">
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-neutral-200 shadow-2xl shadow-neutral-950/20 ring-1 ring-black/10 transition-all duration-500 hover:shadow-indigo-500/25 hover:ring-indigo-500/70 dark:bg-neutral-900 dark:shadow-black/90 dark:ring-white/15 dark:hover:ring-indigo-400/70">
      {bad ? <div className="h-full w-full bg-gradient-to-br from-indigo-500/30 to-neutral-900"/> : <img src={PHOTOS[i % PHOTOS.length]} alt="" draggable={false} onError={() => setBad(true)} className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"/>}
      <div className="absolute inset-0 flex flex-col items-start justify-end bg-gradient-to-t from-black/85 via-black/10 to-transparent p-4 text-left sm:p-5">
        <span className="font-mono text-xs uppercase tracking-widest text-white/95 drop-shadow-md sm:text-sm">{h.file}.csv</span>
        <span className="mt-1 text-xs text-white/70">{f(h.rows)} rows · {h.cols} columns</span></div></div></motion.button>
}

export default function PerspectiveTunnel({files, onOpen, onEnter}: {files: Health[]; onOpen: (file: string) => void; onEnter: () => void}) {
  const reduce = useReducedMotion(), total = files.length, rows = files.reduce((s, h) => s + h.rows, 0)
  const [stage, setStage] = useState<Stage>({w: 1440, h: 900, mobile: false})
  const raw = useMotionValue(0), smooth = useSpring(raw, {stiffness: 80, damping: 30, restDelta: 0.0001}), pointer = useParallax(!reduce)
  useEffect(() => { const u = () => setStage({w: innerWidth, h: innerHeight, mobile: innerWidth < 768}); u(); addEventListener('resize', u); return () => removeEventListener('resize', u) }, [])
  // Captures wheel/touch only while the tunnel is at the top of the page and has travel left, then hands scrolling back.
  useEffect(() => {
    if (reduce) return
    const step = (d: number) => { const c = raw.get(); if (scrollY > 4 || (d > 0 && c >= 1) || (d < 0 && c <= 0)) return false; raw.set(clamp(c + d)); return true }
    const wheel = (e: WheelEvent) => { if (step(e.deltaY * 0.0008)) e.preventDefault() }
    let ly = 0; const ts = (e: TouchEvent) => { ly = e.touches[0].clientY }
    const tm = (e: TouchEvent) => { const y = e.touches[0].clientY, used = step((ly - y) * 0.003); ly = y; if (used) e.preventDefault() }
    addEventListener('wheel', wheel, {passive: false}); addEventListener('touchstart', ts, {passive: true}); addEventListener('touchmove', tm, {passive: false})
    return () => { removeEventListener('wheel', wheel); removeEventListener('touchstart', ts); removeEventListener('touchmove', tm) }
  }, [reduce, raw])
  const count = useTransform(smooth, v => Math.min(total, Math.round(v * total)))
  const tScale = useTransform(smooth, [0, 0.5, 1], [0.7, 1, 1.35]), tOp = useTransform(smooth, [0, 0.12, 0.85, 1], [0.25, 1, 1, 0])
  const prompt = useTransform(smooth, [0, 0.12], [1, 0]), cta = useTransform(smooth, [0.85, 0.97], [0, 1]), ctaPE = useTransform(smooth, v => (v > 0.9 ? 'auto' : 'none'))
  const g1 = useTransform(smooth, [0, 1], [0.8, 1.7]), g2 = useTransform(smooth, [0, 1], [1.2, 0.6])
  const Headline = <>
    <p className="mb-4 font-mono text-xs uppercase tracking-[0.4em] text-indigo-600 dark:text-indigo-400">Intake sequence</p>
    <h2 className="bg-gradient-to-b from-neutral-950 via-neutral-800 to-neutral-400 bg-clip-text text-5xl font-bold leading-[0.9] tracking-tighter text-transparent dark:from-white dark:via-white dark:to-white/40 sm:text-7xl md:text-8xl">THE DATA PACK,<br/>AS DELIVERED.</h2>
    <p className="mt-4 max-w-[38ch] text-sm font-light text-neutral-600 dark:text-neutral-400 sm:text-base">{total} files and {f(rows)} rows. Nothing is corrected, merged or deleted.</p></>
  if (reduce) return <section className="bg-bg px-6 py-14 text-center" aria-label="Data pack files"><div className="mx-auto flex max-w-xl flex-col items-center">{Headline}</div>
    <div className="mx-auto my-8 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">{files.map(h => <button key={h.file} onClick={() => onOpen(h.file)} className="rounded-xl border border-fg/10 bg-surface p-4 text-left"><b className="block font-mono text-xs uppercase tracking-widest">{h.file}.csv</b><span className="text-xs text-fg/60">{f(h.rows)} rows</span></button>)}</div><Button onClick={onEnter}>Enter the command center</Button></section>
  return <section aria-label="Data pack intake" className="relative flex h-[calc(100svh-7rem)] min-h-[540px] select-none items-center justify-center overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-white" style={{perspective: stage.mobile ? '900px' : '1200px', transformStyle: 'preserve-3d'}}>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] opacity-70 [background-size:28px_28px] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,#000_60%,transparent_100%)] dark:bg-[radial-gradient(#1e1b4b_1px,transparent_1px)] dark:opacity-65"/>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15)_0%,transparent_70%)] dark:bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.2)_0%,transparent_75%)]"/>
    <motion.div style={{scale: g1}} className="pointer-events-none absolute h-[48vmin] w-[48vmin] rounded-full border border-indigo-500/25 dark:border-indigo-400/20"/>
    <motion.div style={{scale: g2}} className="pointer-events-none absolute h-[76vmin] w-[76vmin] rounded-full border border-dashed border-neutral-300/60 dark:border-white/10"/>
    <motion.div style={{scale: tScale, opacity: tOp}} className="pointer-events-none z-0 flex max-w-2xl flex-col items-center px-6 text-center">{Headline}
      <p className="mt-3 font-mono text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">Files inspected <motion.b className="text-indigo-600 dark:text-indigo-400">{count}</motion.b> of {total}</p></motion.div>
    <motion.div style={{opacity: prompt}} className="pointer-events-none absolute bottom-8 z-20 flex flex-col items-center gap-2 font-mono text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400"><span>Scroll to explore</span><div className="h-6 w-px bg-gradient-to-b from-indigo-500 to-transparent"/></motion.div>
    <motion.div style={{opacity: cta, pointerEvents: ctaPE}} className="absolute bottom-8 z-30"><Button onClick={onEnter}>Enter the command center</Button></motion.div>
    <button onClick={onEnter} className="absolute right-4 top-4 z-30 rounded-full border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-200/60 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10">Skip to the desk</button>
    <p className="pointer-events-none absolute bottom-2 right-4 z-20 text-[10px] text-neutral-500">Photos are illustrative stock images, not from Aarohan.</p>
    <div className="pointer-events-none absolute inset-0" style={{transformStyle: 'preserve-3d'}}>{files.map((h, i) => <Card key={h.file} h={h} i={i} total={total} progress={smooth} pointer={pointer} stage={stage} onOpen={onOpen}/>)}</div>
  </section>
}
