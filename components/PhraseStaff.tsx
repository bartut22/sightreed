"use client"

import { useEffect, useRef } from "react"
import type { Score, Event, PitchSpelling, NoteEvent } from "@/lib/notation"
import { durToTicks, TICKS_PER_QUARTER } from "@/lib/notation"

type Props = {
  score: Score
  title?: string
  currentTime: number
  tempo: number
  noteResults?: Array<{ tick: number, passed: boolean }>  // ✅ New prop
}

// --- Helpers (Pure functions kept outside component) ---

const NOTE_STEPS = [0, 2, 4, 5, 7, 9, 11]

function midiToDiatonicStep(midi: number) {
  const octave = Math.floor(midi / 12)
  const pc = ((midi % 12) + 12) % 12
  const step = NOTE_STEPS.findIndex(
    (s, i) => pc >= s && (i === NOTE_STEPS.length - 1 || pc < NOTE_STEPS[i + 1])
  )
  return octave * 7 + step
}

function pitchToMidi(p: PitchSpelling) {
  const base: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  }
  return (p.octave + 1) * 12 + base[p.step] + p.alter
}

function getAccidentalFromPitch(p: PitchSpelling) {
  if (p.alter === 1) return "#"
  if (p.alter === -1) return "b"
  return null
}

type DrawItem = {
  event: Event
  x: number
  durTicks: number
  tick: number
  measureIndex: number
  eventIndex: number
  y?: number
  stemX?: number
  stemTopY?: number
  isBeamed?: boolean
  isTriplet?: boolean
  passed?: boolean  // ✅ Add correctness flag
}

export default function PhraseStaff({ score, title, currentTime, tempo, noteResults }: Props) {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)
  const fgCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const STAFF_TOP = 160
  const LINE_SPACING = 18
  const LEFT_PAD = 50
  const RIGHT_PAD = 30
  const CLEF_PAD = 50
  const AFTER_CLEF_PAD = 16
  const MEASURE_TICKS = TICKS_PER_QUARTER * 4

  const TREBLE_BOTTOM_LINE_MIDI = 64
  const TREBLE_BOTTOM_LINE_STEP = midiToDiatonicStep(TREBLE_BOTTOM_LINE_MIDI)
  const STAFF_BOTTOM_STEP = TREBLE_BOTTOM_LINE_STEP
  const STAFF_TOP_STEP = TREBLE_BOTTOM_LINE_STEP + 8

  function stepToY(step: number) {
    return STAFF_TOP + 4 * LINE_SPACING - (step - TREBLE_BOTTOM_LINE_STEP) * (LINE_SPACING / 2)
  }

  function drawLedger(ctx: CanvasRenderingContext2D, x: number, step: number, color: string) {
    const y = stepToY(step)
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(x - 18, y)
    ctx.lineTo(x + 18, y)
    ctx.stroke()
  }

  function drawLedgerLines(ctx: CanvasRenderingContext2D, x: number, step: number, color: string) {
    ctx.lineWidth = 1
    if (step < STAFF_BOTTOM_STEP) {
      for (let s = STAFF_BOTTOM_STEP - 2; s >= step; s -= 2) drawLedger(ctx, x, s, color)
    }
    if (step > STAFF_TOP_STEP) {
      for (let s = STAFF_TOP_STEP + 2; s <= step; s += 2) drawLedger(ctx, x, s, color)
    }
  }

  function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x + 15, y, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawTie(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string) {
    const controlY = y + 15
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x1, y)
    ctx.quadraticCurveTo((x1 + x2) / 2, controlY, x2, y)
    ctx.stroke()
  }

  // ✅ Helper to get color for a note
  function getNoteColor(tick: number): string {
    if (!noteResults) return "white"
    const result = noteResults.find(r => r.tick === tick)
    if (!result) return "white"
    return result.passed ? "#22c55e" : "#ef4444"  // green : red
  }

  useEffect(() => {
    const canvas = bgCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 1. Draw Title
    if (title) {
      ctx.fillStyle = "white"
      ctx.font = "16px sans-serif"
      ctx.fillText(title, LEFT_PAD, 28)
    }

    // 2. Staff lines
    ctx.strokeStyle = "white"
    ctx.lineWidth = 1
    for (let i = 0; i < 5; i++) {
      const y = STAFF_TOP + i * LINE_SPACING
      ctx.beginPath()
      ctx.moveTo(LEFT_PAD, y)
      ctx.lineTo(canvas.width - RIGHT_PAD, y)
      ctx.stroke()
    }

    // 3. Treble clef
    const clef = "\uD834\uDD1E"
    ctx.fillStyle = "white"
    ctx.font = "110px serif"
    const clefX = LEFT_PAD + 6
    const clefBaselineY = STAFF_TOP + 4 * LINE_SPACING
    ctx.fillText(clef, clefX, clefBaselineY)

    const totalTicks = score.measures.length * MEASURE_TICKS
    const usableW = canvas.width - LEFT_PAD - RIGHT_PAD - CLEF_PAD - AFTER_CLEF_PAD
    const x0 = LEFT_PAD + CLEF_PAD + AFTER_CLEF_PAD
    const tickW = usableW / totalTicks

    // 4. Bar lines
    ctx.strokeStyle = "white"
    ctx.lineWidth = 2
    for (let b = 1; b < score.measures.length; b++) {
      const x = x0 + b * MEASURE_TICKS * tickW
      ctx.beginPath()
      ctx.moveTo(x, STAFF_TOP)
      ctx.lineTo(x, STAFF_TOP + 4 * LINE_SPACING)
      ctx.stroke()
    }

    // 5. Draw Events
    let globalTick = 0
    const allItems: DrawItem[] = []

    for (let mi = 0; mi < score.measures.length; mi++) {
      const measure = score.measures[mi]
      let localTick = 0

      for (let ei = 0; ei < measure.events.length; ei++) {
        const e = measure.events[ei]
        const durTicks = durToTicks(e.dur)
        const absoluteTick = mi * MEASURE_TICKS + localTick
        const x = x0 + (absoluteTick + durTicks / 2) * tickW

        if (e.kind === "rest") {
          ctx.fillStyle = "white"
          const restBaselineY = STAFF_TOP + 2.5 * LINE_SPACING

          if (durTicks === 24) {
            ctx.font = "40px serif"
            ctx.fillText("\uD834\uDD3E", x - 14, restBaselineY)
          } else if (durTicks === 48) {
            ctx.font = "36px serif"
            ctx.fillText("𝄽", x - 12, restBaselineY)
          } else if (durTicks === 96) {
            ctx.font = "36px serif"
            ctx.fillText("𝄼", x - 12, restBaselineY - 10)
          } else if (durTicks === 72) {
            ctx.font = "36px serif"
            ctx.fillText("𝄽", x - 12, restBaselineY)
            drawDot(ctx, x + 5, restBaselineY - 15, "white")
          } else if (durTicks === 36) {
            ctx.font = "40px serif"
            ctx.fillText("\uD834\uDD3E", x - 14, restBaselineY)
            drawDot(ctx, x + 5, restBaselineY - 15, "white")
          } else if (durTicks === 144) {
            ctx.font = "36px serif"
            ctx.fillText("𝄼", x - 12, restBaselineY - 10)
            drawDot(ctx, x + 5, restBaselineY - 25, "white")
          } else if (durTicks === 16) {
            ctx.font = "36px serif"
            ctx.fillText("\uD834\uDD3E", x - 12, restBaselineY)
          }

          allItems.push({ event: e, x, durTicks, tick: globalTick + localTick, measureIndex: mi, eventIndex: ei })
        } else {
          const midi = pitchToMidi(e.pitch)
          const step = midiToDiatonicStep(midi)
          const y = stepToY(step)

          // ✅ Get color for this note
          const noteColor = getNoteColor(absoluteTick)

          drawLedgerLines(ctx, x, step, noteColor)

          // Note head
          ctx.beginPath()
          ctx.ellipse(x, y, 8, 6, -0.3, 0, Math.PI * 2)
          ctx.fillStyle = noteColor

          if (durTicks >= 96) {
            ctx.strokeStyle = noteColor
            ctx.lineWidth = 2
            ctx.stroke()
          } else {
            ctx.fill()
          }

          // Accidental
          const acc = getAccidentalFromPitch(e.pitch)
          if (acc) {
            ctx.fillStyle = noteColor
            ctx.font = "14px sans-serif"
            ctx.fillText(acc, x - 20, y + 5)
          }

          // Stem
          const stemX = x + 7
          const stemTopY = y - 30
          ctx.beginPath()
          ctx.moveTo(stemX, y)
          ctx.lineTo(stemX, stemTopY)
          ctx.lineWidth = 2
          ctx.strokeStyle = noteColor
          ctx.stroke()

          // Dot
          if (e.dur === "q." || e.dur === "8." || e.dur === "h.") {
            drawDot(ctx, x, y, noteColor)
          }

          allItems.push({
            event: e, x, durTicks, tick: globalTick + localTick, measureIndex: mi, eventIndex: ei,
            y, stemX, stemTopY, isTriplet: e.dur === "8t",
            passed: noteResults?.find(r => r.tick === absoluteTick)?.passed
          })
        }
        localTick += durTicks
      }
      globalTick += MEASURE_TICKS
    }

    // 6. Beams
    const groups: DrawItem[][] = []
    let current: DrawItem[] = []

    function flush() {
      if (current.length === 2) groups.push([...current])
      current = []
    }

    for (const it of allItems) {
      const isEighthNote = it.event.kind === "note" && it.event.dur === "8" &&
        it.stemX !== undefined && it.stemTopY !== undefined && !it.isTriplet

      if (!isEighthNote) {
        flush()
        continue
      }

      const beatOfThis = Math.floor((it.tick % MEASURE_TICKS) / TICKS_PER_QUARTER)
      const beatOfPrev = current.length > 0 ? Math.floor((current[0].tick % MEASURE_TICKS) / TICKS_PER_QUARTER) : beatOfThis

      if (beatOfThis !== beatOfPrev) flush()
      current.push(it)
      if (current.length === 2) flush()
    }
    flush()

    for (const g of groups) for (const n of g) n.isBeamed = true

    for (const g of groups) {
      // ✅ Use color of first note in beam group
      const beamColor = getNoteColor(g[0].tick)
      
      const beamY = Math.min(...g.map((n) => n.stemTopY!)) - 2
      const xLeft = g[0].stemX!
      const xRight = g[1].stemX!

      ctx.strokeStyle = beamColor
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(xLeft, beamY)
      ctx.lineTo(xRight, beamY)
      ctx.stroke()

      ctx.lineWidth = 2
      for (const n of g) {
        const stemColor = getNoteColor(n.tick)
        ctx.strokeStyle = stemColor
        ctx.beginPath()
        ctx.moveTo(n.stemX!, n.y!)
        ctx.lineTo(n.stemX!, beamY)
        ctx.stroke()
      }
    }

    // 7. Triplets
    const tripletGroups: DrawItem[][] = []
    const grouped = new Set<DrawItem>()
    let i = 0

    while (i < allItems.length) {
      const item = allItems[i]
      if (item.event.dur === "8t" && !grouped.has(item)) {
        const group: DrawItem[] = [item]
        grouped.add(item)
        const beatStart = Math.floor(item.tick / TICKS_PER_QUARTER) * TICKS_PER_QUARTER
        const beatEnd = beatStart + TICKS_PER_QUARTER

        let j = i + 1
        while (j < allItems.length) {
          const next = allItems[j]
          if (next.event.dur === "8t" && next.tick < beatEnd && next.measureIndex === item.measureIndex && !grouped.has(next)) {
            group.push(next)
            grouped.add(next)
            j++
          } else {
            break
          }
        }
        tripletGroups.push(group)
        i = j
      } else {
        i++
      }
    }

    for (const group of tripletGroups) {
      const notes = group.filter(it => it.event.kind === "note")
      if (notes.length >= 2) {
        // ✅ Use color based on first note
        const beamColor = getNoteColor(notes[0].tick)
        
        const beamY = Math.min(...notes.map(n => n.stemTopY!)) - 2
        ctx.strokeStyle = beamColor
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(notes[0].stemX!, beamY)
        ctx.lineTo(notes[notes.length - 1].stemX!, beamY)
        ctx.stroke()

        ctx.lineWidth = 2
        for (const note of notes) {
          const stemColor = getNoteColor(note.tick)
          ctx.strokeStyle = stemColor
          ctx.beginPath()
          ctx.moveTo(note.stemX!, note.y!)
          ctx.lineTo(note.stemX!, beamY)
          ctx.stroke()
        }
        for (const note of notes) note.isBeamed = true
      }

      // Bracket (keep white)
      const xLeft = group[0].x - 20
      const xRight = group[group.length - 1].x + 20
      let bracketY: number
      if (notes.length >= 2) bracketY = Math.min(...notes.map(n => n.stemTopY!)) - 16
      else if (notes.length === 1) bracketY = notes[0].stemTopY! - 45
      else bracketY = STAFF_TOP - 20

      ctx.strokeStyle = "white"
      ctx.fillStyle = "white"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(xLeft, bracketY + 5)
      ctx.lineTo(xLeft, bracketY)
      ctx.lineTo(xRight, bracketY)
      ctx.lineTo(xRight, bracketY + 5)
      ctx.stroke()
      ctx.font = "14px sans-serif"
      ctx.fillText("3", (xLeft + xRight) / 2 - 5, bracketY - 4)
    }

    // 8. Flags
    ctx.lineWidth = 2
    for (const it of allItems) {
      if (it.event.kind === "note" && (it.event.dur === "8" || it.event.dur === "8t") &&
        !it.isBeamed && it.stemX !== undefined && it.stemTopY !== undefined) {
        const flagColor = getNoteColor(it.tick)
        ctx.strokeStyle = flagColor
        const x = it.stemX
        const yTop = it.stemTopY
        ctx.beginPath()
        ctx.moveTo(x, yTop)
        ctx.quadraticCurveTo(x + 14, yTop + 4, x + 6, yTop + 16)
        ctx.stroke()
      }
    }

    // 9. Ties
    for (const it of allItems) {
      if (it.event.kind === "note" && (it.event as NoteEvent).tiedTo) {
        const nextMeasureIdx = it.eventIndex === score.measures[it.measureIndex].events.length - 1 ? it.measureIndex + 1 : it.measureIndex
        const nextEventIdx = it.eventIndex === score.measures[it.measureIndex].events.length - 1 ? 0 : it.eventIndex + 1
        const nextItem = allItems.find(item => item.measureIndex === nextMeasureIdx && item.eventIndex === nextEventIdx)
        if (nextItem && it.y !== undefined && nextItem.y !== undefined) {
          const tieColor = getNoteColor(it.tick)
          drawTie(ctx, it.x + 8, nextItem.x - 8, it.y, tieColor)
        }
      }
    }
  }, [score, title, noteResults])  // ✅ Re-render when noteResults change

  useEffect(() => {
    const canvas = fgCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const totalTicks = score.measures.length * MEASURE_TICKS
    const usableW = canvas.width - LEFT_PAD - RIGHT_PAD - CLEF_PAD - AFTER_CLEF_PAD
    const x0 = LEFT_PAD + CLEF_PAD + AFTER_CLEF_PAD
    const tickW = usableW / totalTicks
    const msPerTick = (60000 / tempo) / TICKS_PER_QUARTER
    const pxPerMs = tickW / msPerTick

    const playheadX = x0 + currentTime * pxPerMs

    if (playheadX >= x0 && playheadX <= canvas.width - RIGHT_PAD) {
      ctx.strokeStyle = "rgba(34, 197, 94, 0.6)"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, STAFF_TOP - 10)
      ctx.lineTo(playheadX, STAFF_TOP + 4 * LINE_SPACING + 10)
      ctx.stroke()
    }
  }, [currentTime, tempo, score.measures.length])

  return (
    <div ref={containerRef} style={{ position: "relative", width: 1000, height: 300 }}>
      <canvas 
        ref={bgCanvasRef} 
        width={1000} 
        height={300} 
        style={{ position: "absolute", top: 0, left: 0, zIndex: 1 }}
      />
      
      <canvas 
        ref={fgCanvasRef} 
        width={1000} 
        height={300} 
        style={{ position: "absolute", top: 0, left: 0, zIndex: 2, pointerEvents: "none" }}
      />
    </div>
  )
}
