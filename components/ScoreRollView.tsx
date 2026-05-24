"use client"

import { durToTicks, pitchToMidi, type Score } from "@/lib/notation"
import type { PlayedNoteBlock, TickState } from "@/lib/performanceTracker"
const DEFAULT_PHRASE_STAFF_CONFIG = {
    staffTop: 120,
    lineSpacing: 18,
    leftPad: 50,
    rightPad: 30,
    clefPad: 50,
    afterClefPad: 16,

    noteHeadWidth: 8,
    noteHeadHeight: 6,
    noteHeadRotation: -0.3,
    stemLength: 30,
    stemWidth: 2,
    ledgerLineExtension: 18,

    clefFont: "110px serif",
    titleFont: "16px sans-serif",
    restFont: "36px serif",
    tripletFont: "14px sans-serif",
    accidentalFont: "14px sans-serif",

    primaryColor: "black",
    wrongPitchColor: "#eab308",
    correctNoteColor: "#4ecb41",
    incorrectNoteColor: "#ef4444",
    playheadColor: "rgba(34, 197, 94, 0.6)",

    trebleBottomLineMidi: 64,
}

import { JSX, useCallback, useEffect, useState } from "react"

type Block = { startTick: number; endTick: number; midi: number; played?: boolean }
type NoteStatus = "correct" | "wrong" | "timing" | "missing"
type NoteBlock = Block & { status?: NoteStatus }

function expectedBlocks(score: Score): Block[] {
  const out: Block[] = []
  let tick = 0
  for (const m of score.measures) {
    for (const e of m.events) {
      const d = durToTicks(e.dur)
      if (e.kind === "note") out.push({ startTick: tick, endTick: tick + d, midi: pitchToMidi(e.pitch) })
      tick += d
    }
  }
  return out
}

const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

function midiToLabel(midi: number): string {
  const noteName = NOTE_NAMES[((midi % 12) + 12) % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${noteName}${octave}`
}

function classifyPerformance(
  expected: Block[],
  actual: Block[]
): { actualWithStatus: NoteBlock[]; missing: NoteBlock[] } {
  const TIMING_THRESHOLD = 6
  const actualWithStatus: NoteBlock[] = []
  const matchedExpected = new Set<number>()

  for (const a of actual) {
    let bestIdx = -1
    let bestOverlap = 0
    for (let i = 0; i < expected.length; i++) {
      const e = expected[i]
      const overlap = Math.max(0, Math.min(a.endTick, e.endTick) - Math.max(a.startTick, e.startTick))
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        bestIdx = i
      }
    }

    if (bestIdx === -1 || bestOverlap === 0) {
      actualWithStatus.push({ ...a, status: "wrong" })
      continue
    }

    const e = expected[bestIdx]
    const pitchMatch = a.midi === e.midi;
    if (!pitchMatch) {
      actualWithStatus.push({ ...a, status: "wrong" })
      continue
    }

    matchedExpected.add(bestIdx)
    const timingOffset = a.startTick - e.startTick
    if (Math.abs(timingOffset) > TIMING_THRESHOLD) {
      actualWithStatus.push({ ...a, status: "timing" })
    } else {
      actualWithStatus.push({ ...a, status: "correct" })
    }
  }

  const missing: NoteBlock[] = []
  for (let i = 0; i < expected.length; i++) {
    if (!matchedExpected.has(i)) {
      missing.push({ ...expected[i], status: "missing" })
    }
  }

  return { actualWithStatus, missing }
}

type Props = {
  score: Score;
  performedNotes: PlayedNoteBlock[];
  stateHistory?: TickState[];
  transposeSemitones?: number;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  isListening?: boolean;
  tempo: number;
  playbackOffsetSec?: number;
  minMidi?: number;
  maxMidi?: number;
};

export default function ScoreRollView({
  score, performedNotes, stateHistory = [], transposeSemitones = 0,
  audioRef, isListening = false, tempo = 120,
  playbackOffsetSec = 0, minMidi = 60, maxMidi = 88
}: Props) {
  const exp = expectedBlocks(score)
  const act = performedNotes
  const { actualWithStatus, missing } = classifyPerformance(exp, act)
  const totalTicks = score.measures.length * 4 * 48
  minMidi = minMidi ?? Math.max(0,  Math.min(...exp.map(b => b.midi)) - 2)
  maxMidi = maxMidi ?? Math.min(127, Math.max(...exp.map(b => b.midi)) + 2)
  const rowHeight = 16
  const topPad = 24
  const bottomPad = 24
  const W = 1200
  const rollHeight = (maxMidi - minMidi + 1) * rowHeight
  const H = topPad + rollHeight + bottomPad
  const rollTop = topPad
  const x = useCallback((t: number) => 70 + (t / totalTicks) * (W - 120), [totalTicks, W])
  const y = (m: number) => rollTop + (maxMidi - m) * rowHeight

  const CENTS_RANGE = 50; // ±50 cents maps to ±half rowHeight

  const [playheadX, setPlayheadX] = useState<number | null>(null)

  useEffect(() => {
    if (!isListening || !audioRef?.current) {
      return
    }
    let rafId: number
    const tick = () => {
      const audio = audioRef.current
      if (audio && audio.duration) {
        // divide by number of bars times beats per bar times 60 / tempo
        const duration = (score.measures.length * 4) * (60 / tempo)
        const progress = Math.max(0, audio.currentTime - playbackOffsetSec) / duration
        setPlayheadX(x(progress * totalTicks))
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [audioRef, isListening, playbackOffsetSec, score.measures.length, tempo, totalTicks, x])

  return (
    <div style={{ overflow: "hidden", background: "#f3f3f3", borderRadius: 12 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>

        {[...Array(maxMidi - minMidi + 2)].map((_, i) => {
          const yLine = rollTop + i * rowHeight
          return <line key={`h-${i}`} x1={52} x2={W} y1={yLine} y2={yLine} stroke="#d8d8d8" strokeWidth="1" />
        })}

        {[...Array(score.measures.length + 1)].map((_, i) => {
          const t = i * 4 * 48
          return <line key={i} x1={x(t)} x2={x(t)} y1={0} y2={H} stroke="#b5b5b5" />
        })}

        {[...Array(maxMidi - minMidi + 1)].map((_, i) => {
          const midi = maxMidi - i
          // console.log(midi)
          const yLabel = y(midi) + rowHeight * 0.72
          const HZ = Math.floor(440 * Math.pow(2, (midi - 69 + transposeSemitones) / 12));
);
      )
        })}

        {exp.map((b, i) => (
          <rect
            key={`e-${i}`}
            x={x(b.startTick)}
            y={y(b.midi)}
            width={x(b.endTick) - x(b.startTick)}
            height={rowHeight}
            fill="none"
            stroke="#2233ff"
            strokeWidth="1.5"
          />
        ))}

        {missing.map((b, i) => (
          <rect
            key={`m-${i}`}
            x={x(b.startTick)}
            y={y(b.midi)}
            width={Math.max(3, x(b.endTick) - x(b.startTick))}
            height={rowHeight}
            fill="none"
            stroke="#2233ff"
            strokeWidth="3"
          />
        ))}

        {actualWithStatus.map((b, i) => {
          const fill = b.status === "correct"
            ? DEFAULT_PHRASE_STAFF_CONFIG.correctNoteColor
            : b.status === "timing"
              ? DEFAULT_PHRASE_STAFF_CONFIG.wrongPitchColor
              : DEFAULT_PHRASE_STAFF_CONFIG.incorrectNoteColor;

          return (
            <rect
              key={`a-${i}`}
              x={x(b.startTick)}
              y={y(b.midi)}
              width={Math.max(3, x(b.endTick) - x(b.startTick))}
              height={rowHeight}
              fill={fill}
              stroke="#111"
            />
          )
        })}

        {actualWithStatus.map((b, i) => {
          // Find the expected MIDI for this block by matching to expected blocks
          const matchedExp = exp.find(e =>
            Math.max(b.startTick, e.startTick) < Math.min(b.endTick, e.endTick)
          );
          if (!matchedExp) return null;

          const concertMidi = b.midi + transposeSemitones;
          const expectedHz = 440 * Math.pow(2, (concertMidi - 69) / 12);
          const centerY = y(b.midi) + rowHeight / 2;
          const dots: JSX.Element[] = [];

          const blockStates = stateHistory.filter(
            s => s.tick >= b.startTick && s.tick <= b.endTick && s.actualHz != null
          );
          for (const s of blockStates) {
            const cents = 1200 * Math.log2(s.actualHz! / expectedHz);
            const clampedCents = Math.max(-CENTS_RANGE, Math.min(CENTS_RANGE, cents));
            const dotY = centerY - (clampedCents / CENTS_RANGE) * (rowHeight / 2);
            dots.push(
              <circle key={`int-${i}-${s.tick}`} cx={x(s.tick)} cy={dotY} r={1.5} fill="white" opacity={0.85} />
            );
          }
          return <g key={`intonation-${i}`}>{dots}</g>;
        })}

        {isListening && playheadX !== null && (
          <line
            x1={playheadX} x2={playheadX}
            y1={0} y2={H}
            stroke="#facc15"
            strokeWidth={2}
            opacity={0.9}
          />
        )}

      </svg>
    </div>
  )
}
