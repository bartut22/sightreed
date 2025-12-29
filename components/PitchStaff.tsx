"use client"

import { useEffect, useRef } from "react"

type Props = {
  pitch: number | null
  rms: number
  clarity?: number
  transposeSemitones?: number
}

const NOTE_STEPS = [0, 2, 4, 5, 7, 9, 11]
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

function midiToDiatonicStep(midi: number) {
  const octave = Math.floor(midi / 12)
  const pc = ((midi % 12) + 12) % 12

  let step = NOTE_STEPS.findIndex(
    (s, i) => pc >= s && (i === NOTE_STEPS.length - 1 || pc < NOTE_STEPS[i + 1])
  )

  return octave * 7 + step
}

function getAccidental(midi: number) {
  const pc = ((midi % 12) + 12) % 12
  if ([1, 3, 6, 8, 10].includes(pc)) return "#"
  return null
}

function getDynamicMarking(rms: number): string {
  if (rms < 0.02) return "p"
  if (rms < 0.04) return "mp"
  if (rms < 0.07) return "mf"
  if (rms < 0.11) return "f"
  return "ff"
}

export default function PitchStaff({ pitch, rms, clarity, transposeSemitones = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const STAFF_TOP = 60
  const LINE_SPACING = 20
  const NOTE_X = 260

  const TREBLE_BOTTOM_LINE_MIDI = 64
  const TREBLE_BOTTOM_LINE_STEP = midiToDiatonicStep(TREBLE_BOTTOM_LINE_MIDI)

  const STAFF_BOTTOM_STEP = TREBLE_BOTTOM_LINE_STEP
  const STAFF_TOP_STEP = TREBLE_BOTTOM_LINE_STEP + 8

  function stepToY(step: number) {
    return STAFF_TOP + 4 * LINE_SPACING - (step - TREBLE_BOTTOM_LINE_STEP) * (LINE_SPACING / 2)
  }

  function drawLedger(ctx: CanvasRenderingContext2D, step: number) {
    const y = stepToY(step)
    ctx.beginPath()
    ctx.moveTo(NOTE_X - 22, y)
    ctx.lineTo(NOTE_X + 22, y)
    ctx.stroke()
  }

  function drawLedgerLines(ctx: CanvasRenderingContext2D, step: number) {
    ctx.strokeStyle = "white"

    if (step < STAFF_BOTTOM_STEP) {
      for (let s = STAFF_BOTTOM_STEP - 2; s >= step; s -= 2) {
        drawLedger(ctx, s)
      }
    }

    if (step > STAFF_TOP_STEP) {
      for (let s = STAFF_TOP_STEP + 2; s <= step; s += 2) {
        drawLedger(ctx, s)
      }
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // ---- STAFF ----
    ctx.strokeStyle = "white"
    ctx.lineWidth = 1
    for (let i = 0; i < 5; i++) {
      const y = STAFF_TOP + i * LINE_SPACING
      ctx.beginPath()
      ctx.moveTo(40, y)
      ctx.lineTo(canvas.width - 40, y)
      ctx.stroke()
    }

    // ---- NOTE ----
    if (pitch) {
      const concertMidi = Math.round(69 + 12 * Math.log2(pitch / 440))
      const transposedMidi = concertMidi + transposeSemitones
      const step = midiToDiatonicStep(transposedMidi)
      const y = stepToY(step)

      drawLedgerLines(ctx, step)

      ctx.beginPath()
      ctx.ellipse(NOTE_X, y, 9, 7, -0.3, 0, Math.PI * 2)
      ctx.fillStyle = "white"
      ctx.fill()

      ctx.beginPath()
      ctx.moveTo(NOTE_X + 8, y)
      ctx.lineTo(NOTE_X + 8, y - 35)
      ctx.lineWidth = 2
      ctx.strokeStyle = "white"
      ctx.stroke()

      const accidental = getAccidental(transposedMidi)
      if (accidental) {
        ctx.font = "16px sans-serif"
        ctx.fillStyle = "white"
        ctx.fillText(accidental, NOTE_X - 20, y + 5)
      }
    }

    // ---- DYNAMICS BAR ----
    const dynHeight = Math.min(120, rms * 1200)
    ctx.fillStyle = "lime"
    ctx.fillRect(canvas.width - 30, STAFF_TOP + 4 * LINE_SPACING - dynHeight, 10, dynHeight)

    // ---- Dynamic marking text ----
    const marking = getDynamicMarking(rms)
    ctx.fillStyle = "white"
    ctx.font = "italic 16px serif"
    ctx.fillText(marking, canvas.width - 33, STAFF_TOP + 4 * LINE_SPACING + 18)

    // ---- Confidence Bar ----
    if (clarity !== undefined) {
      const barHeight = clarity * 60
      ctx.fillStyle = "orange"
      ctx.fillRect(canvas.width - 50, STAFF_TOP + 4 * LINE_SPACING - barHeight, 8, barHeight)
    }
  }, [pitch, rms, clarity ?? 0, transposeSemitones ?? 0])

  return (
    <canvas
      ref={canvasRef}
      width={720}
      height={260}
      style={{
        background: "#111",
        border: "1px solid #333",
        display: "block",
      }}
    />
  )
}
