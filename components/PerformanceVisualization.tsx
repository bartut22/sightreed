"use client"

import { useEffect, useRef } from "react"
import type { Score } from "@/lib/notation"

type PlayedNote = {
  kind: "note"
  pitch: number
  startTick: number
  durationTicks: number
  rms: number
}

type PlayedRest = {
  kind: "rest"
  startTick: number
  durationTicks: number
}

type PlayedEvent = PlayedNote | PlayedRest

type Props = {
  playedEvents: PlayedEvent[] // Changed from playedNotes
  score: Score
  tempo: number
  currentTime: number
  transposeSemitones: number
  currentNote: { pitch: number; startTime: number; rms: number } | null
}

const TICKS_PER_QUARTER = 48
const TICKS_PER_MEASURE = TICKS_PER_QUARTER * 4
const NOTE_STEPS = [0, 2, 4, 5, 7, 9, 11]

function midiToDiatonicStep(midi: number) {
  const octave = Math.floor(midi / 12)
  const pc = ((midi % 12) + 12) % 12
  const step = NOTE_STEPS.findIndex(
    (s, i) => pc >= s && (i === NOTE_STEPS.length - 1 || pc < NOTE_STEPS[i + 1])
  )
  return octave * 7 + step
}

function getAccidental(midi: number) {
  const pc = ((midi % 12) + 12) % 12
  if ([1, 3, 6, 8, 10].includes(pc)) return "#"
  return null
}

type DrawItem = {
  event: PlayedEvent
  x: number
  xStart: number // Start of note duration
  xEnd: number   // End of note duration
  measureIndex: number
  y?: number
  stemX?: number
  stemTopY?: number
  isBeamed?: boolean
}

export default function PerformanceVisualization({ playedEvents, score, tempo, currentTime, transposeSemitones, currentNote }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const STAFF_TOP = 60
  const LINE_SPACING = 18
  const LEFT_PAD = 50
  const RIGHT_PAD = 30
  const CLEF_PAD = 50
  const AFTER_CLEF_PAD = 16
  const TREBLE_BOTTOM_LINE_MIDI = 64
  const TREBLE_BOTTOM_LINE_STEP = midiToDiatonicStep(TREBLE_BOTTOM_LINE_MIDI)
  const STAFF_BOTTOM_STEP = TREBLE_BOTTOM_LINE_STEP
  const STAFF_TOP_STEP = TREBLE_BOTTOM_LINE_STEP + 8

  function stepToY(step: number) {
    return STAFF_TOP + 4 * LINE_SPACING - (step - TREBLE_BOTTOM_LINE_STEP) * (LINE_SPACING / 2)
  }

  function drawLedgerLines(ctx: CanvasRenderingContext2D, x: number, step: number) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"
    ctx.lineWidth = 1

    if (step < STAFF_BOTTOM_STEP) {
      for (let s = STAFF_BOTTOM_STEP - 2; s >= step; s -= 2) {
        const y = stepToY(s)
        ctx.beginPath()
        ctx.moveTo(x - 18, y)
        ctx.lineTo(x + 18, y)
        ctx.stroke()
      }
    }

    if (step > STAFF_TOP_STEP) {
      for (let s = STAFF_TOP_STEP + 2; s <= step; s += 2) {
        const y = stepToY(s)
        ctx.beginPath()
        ctx.moveTo(x - 18, y)
        ctx.lineTo(x + 18, y)
        ctx.stroke()
      }
    }
  }

  function drawArticulation(ctx: CanvasRenderingContext2D, x: number, y: number, type: "staccato" | "tenuto") {
    if (type === "staccato") {
      // Staccato dot
      ctx.fillStyle = "white"
      ctx.beginPath()
      ctx.arc(x, y + 20, 2.5, 0, Math.PI * 2)
      ctx.fill()
    } else if (type === "tenuto") {
      // Tenuto line
      ctx.strokeStyle = "white"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 8, y + 20)
      ctx.lineTo(x + 8, y + 20)
      ctx.stroke()
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = "white"
    ctx.font = "14px sans-serif"
    ctx.fillText("What You're Playing", LEFT_PAD, 28)

    // Staff lines
    ctx.strokeStyle = "white"
    ctx.lineWidth = 1
    for (let i = 0; i < 5; i++) {
      const y = STAFF_TOP + i * LINE_SPACING
      ctx.beginPath()
      ctx.moveTo(LEFT_PAD, y)
      ctx.lineTo(canvas.width - RIGHT_PAD, y)
      ctx.stroke()
    }

    // Treble clef
    const clef = "\uD834\uDD1E"
    ctx.fillStyle = "white"
    ctx.font = "110px serif"
    const clefX = LEFT_PAD + 6
    const clefBaselineY = STAFF_TOP + 4 * LINE_SPACING
    ctx.fillText(clef, clefX, clefBaselineY)

    const totalMeasures = score.measures.length
    const usableW = canvas.width - LEFT_PAD - RIGHT_PAD - CLEF_PAD - AFTER_CLEF_PAD
    const x0 = LEFT_PAD + CLEF_PAD + AFTER_CLEF_PAD
    const pxPerMeasure = usableW / totalMeasures
    const pxPerTick = pxPerMeasure / TICKS_PER_MEASURE
    const msPerTick = (60000 / tempo) / TICKS_PER_QUARTER
    const pxPerMs = pxPerTick / msPerTick

    // Draw bar lines
    ctx.strokeStyle = "white"
    ctx.lineWidth = 2
    for (let m = 1; m < totalMeasures; m++) {
      const barX = x0 + m * pxPerMeasure
      ctx.beginPath()
      ctx.moveTo(barX, STAFF_TOP)
      ctx.lineTo(barX, STAFF_TOP + 4 * LINE_SPACING)
      ctx.stroke()
    }

    const allItems: DrawItem[] = []
    
    for (const event of playedEvents) {
      const measureIndex = Math.floor(event.startTick / TICKS_PER_MEASURE)
      
      // FIXED SPACING: Position at startTick, not centered
      const xStart = x0 + event.startTick * pxPerTick
      const xEnd = x0 + (event.startTick + event.durationTicks) * pxPerTick
      const x = xStart + 10 // Slight offset for note head center

      if (event.kind === "rest") {
        // DRAW RESTS
        ctx.fillStyle = "white"
        const restBaselineY = STAFF_TOP + 2.5 * LINE_SPACING
        const restX = (xStart + xEnd) / 2 // Center rest in its duration

        if (event.durationTicks === 24) { // Eighth rest
          ctx.font = "40px serif"
          ctx.fillText("\uD834\uDD3E", restX - 14, restBaselineY)
        } else if (event.durationTicks === 48) { // Quarter rest
          ctx.font = "36px serif"
          ctx.fillText("𝄽", restX - 12, restBaselineY)
        } else if (event.durationTicks === 96) { // Half rest
          ctx.font = "36px serif"
          ctx.fillText("𝄼", restX - 12, restBaselineY - 10)
        } else if (event.durationTicks === 192) { // Whole rest
          ctx.fillRect(restX - 12, STAFF_TOP + LINE_SPACING - 5, 24, 6)
        }

        allItems.push({ event, x: restX, xStart, xEnd, measureIndex })
        continue
      }

      // DRAW NOTES
      const concertMidi = Math.round(69 + 12 * Math.log2(event.pitch / 440))
      const transposedMidi = concertMidi + transposeSemitones
      const step = midiToDiatonicStep(transposedMidi)
      const y = stepToY(step)

      drawLedgerLines(ctx, x, step)

      // Note head
      ctx.beginPath()
      ctx.ellipse(x, y, 8, 6, -0.3, 0, Math.PI * 2)
      ctx.fillStyle = "white"
      
      if (event.durationTicks >= 96) { // Half note - hollow
        ctx.strokeStyle = "white"
        ctx.lineWidth = 2
        ctx.stroke()
      } else {
        ctx.fill()
      }

      // Accidental
      const acc = getAccidental(transposedMidi)
      if (acc) {
        ctx.fillStyle = "white"
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
      ctx.strokeStyle = "white"
      ctx.stroke()

      // Articulation (detect from duration ratio)
      const expectedQuarter = TICKS_PER_QUARTER
      if (event.durationTicks < expectedQuarter * 0.6) {
        drawArticulation(ctx, x, y, "staccato")
      } else if (event.durationTicks > expectedQuarter * 1.3 && event.durationTicks < 96) {
        drawArticulation(ctx, x, y, "tenuto")
      }

      allItems.push({ event, x, xStart, xEnd, measureIndex, y, stemX, stemTopY })
    }

    // BEAMING LOGIC
    const groups: DrawItem[][] = []
    let current: DrawItem[] = []

    function flush() {
      if (current.length === 2) groups.push([...current])
      current = []
    }

    for (const it of allItems) {
      const isEighthNote = it.event.kind === "note" && it.event.durationTicks === 24

      if (!isEighthNote) {
        flush()
        continue
      }

      const tickInMeasure = it.event.startTick % TICKS_PER_MEASURE
      const beatOfThis = Math.floor(tickInMeasure / TICKS_PER_QUARTER)
      const beatOfPrev = current.length > 0 
        ? Math.floor((current[0].event.startTick % TICKS_PER_MEASURE) / TICKS_PER_QUARTER)
        : beatOfThis

      if (beatOfThis !== beatOfPrev) {
        flush()
      }

      current.push(it)
      if (current.length === 2) flush()
    }

    flush()
    for (const g of groups) for (const n of g) n.isBeamed = true

    // Draw beams
    ctx.strokeStyle = "white"
    for (const g of groups) {
      const beamY = Math.min(...g.map(n => n.stemTopY!)) - 2
      const xLeft = g[0].stemX!
      const xRight = g[1].stemX!

      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(xLeft, beamY)
      ctx.lineTo(xRight, beamY)
      ctx.stroke()

      ctx.lineWidth = 2
      for (const n of g) {
        ctx.beginPath()
        ctx.moveTo(n.stemX!, n.y!)
        ctx.lineTo(n.stemX!, beamY)
        ctx.stroke()
      }
    }

    // Draw flags for unbeamed eighths
    ctx.strokeStyle = "white"
    ctx.lineWidth = 2
    for (const it of allItems) {
      if (it.event.kind === "note" && it.event.durationTicks === 24 && !it.isBeamed) {
        ctx.beginPath()
        ctx.moveTo(it.stemX!, it.stemTopY!)
        ctx.quadraticCurveTo(it.stemX! + 14, it.stemTopY! + 4, it.stemX! + 6, it.stemTopY! + 16)
        ctx.stroke()
      }
    }

    // Current note (blue)
    if (currentNote && currentNote.pitch) {
      const concertMidi = Math.round(69 + 12 * Math.log2(currentNote.pitch / 440))
      const transposedMidi = concertMidi + transposeSemitones
      const step = midiToDiatonicStep(transposedMidi)
      const y = stepToY(step)

      const playheadX = x0 + currentTime * pxPerMs

      drawLedgerLines(ctx, playheadX, step)

      ctx.beginPath()
      ctx.ellipse(playheadX, y, 8, 6, -0.3, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(59, 130, 246, 0.7)"
      ctx.fill()

      const acc = getAccidental(transposedMidi)
      if (acc) {
        ctx.fillStyle = "rgba(59, 130, 246, 0.7)"
        ctx.font = "14px sans-serif"
        ctx.fillText(acc, playheadX - 20, y + 5)
      }

      const stemX = playheadX + 7
      const stemTopY = y - 30
      ctx.beginPath()
      ctx.moveTo(stemX, y)
      ctx.lineTo(stemX, stemTopY)
      ctx.strokeStyle = "rgba(59, 130, 246, 0.7)"
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Playhead
    const playheadX = x0 + currentTime * pxPerMs
    if (playheadX >= x0 && playheadX <= canvas.width - RIGHT_PAD) {
      ctx.strokeStyle = "rgba(34, 197, 94, 0.6)"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, STAFF_TOP - 10)
      ctx.lineTo(playheadX, STAFF_TOP + 4 * LINE_SPACING + 10)
      ctx.stroke()
    }
  }, [playedEvents, currentTime, score, tempo, transposeSemitones, currentNote])

  return <canvas ref={canvasRef} width={800} height={300} className="w-full h-auto bg-transparent" />
}
