// Durations: dotted, triplets, and ties
export type Duration = 
  | "q"      // Quarter
  | "8"      // Eighth
  | "q."     // Dotted quarter  
  | "8."     // Dotted eighth
  | "16"     // Sixteenth
  | "8t"     // Eighth triplet
  | "h"      // Half note
  | "h."     // Dotted half

export type PitchSpelling = {
  step: "C" | "D" | "E" | "F" | "G" | "A" | "B"
  alter: -1 | 0 | 1
  octave: number
}

export type NoteEvent = {
  kind: "note"
  pitch: PitchSpelling
  dur: Duration
  tiedTo?: boolean  // Is this note tied to the next?
  tiedFrom?: boolean // Is this note tied from the previous?
}

export type RestEvent = {
  kind: "rest"
  dur: Duration
}

export type Event = NoteEvent | RestEvent
export type TimeSig = { beats: 4; beatUnit: 4 }

export type Measure = {
  timeSig: TimeSig
  events: Event[]
}

export type Score = {
  measures: Measure[]
}

// Tick system (24 ticks per quarter for triplet support)
export const TICKS_PER_QUARTER = 48
export const TICKS_PER_EIGHTH = 24 
export const TICKS_PER_TRIPLET = 16
export const TICKS_PER_DOTTED_QUARTER = 72
export const TICKS_PER_DOTTED_EIGHTH = 36
export const TICKS_PER_HALF = 96
export const TICKS_PER_DOTTED_HALF = 144

export function durToTicks(d: Duration): number {
  switch (d) {
    case "q": return TICKS_PER_QUARTER
    case "8": return TICKS_PER_EIGHTH
    case "q.": return TICKS_PER_DOTTED_QUARTER
    case "8.": return TICKS_PER_DOTTED_EIGHTH
    case "8t": return TICKS_PER_TRIPLET
    case "h": return TICKS_PER_HALF
    case "h.": return TICKS_PER_DOTTED_HALF
  }
}

export function totalTicks(durs: Duration[]): number {
  return durs.reduce((s, d) => s + durToTicks(d), 0)
}

export function measureTicks(ts: TimeSig) {
  return ts.beats * TICKS_PER_QUARTER
}

export function midiToPitchSpelling(midi: number): PitchSpelling {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  
  const map: Record<number, { step: PitchSpelling["step"]; alter: -1 | 0 | 1 }> = {
    0: { step: "C", alter: 0 },
    1: { step: "C", alter: 1 },
    2: { step: "D", alter: 0 },
    3: { step: "D", alter: 1 },
    4: { step: "E", alter: 0 },
    5: { step: "F", alter: 0 },
    6: { step: "F", alter: 1 },
    7: { step: "G", alter: 0 },
    8: { step: "G", alter: 1 },
    9: { step: "A", alter: 0 },
    10: { step: "A", alter: 1 },
    11: { step: "B", alter: 0 },
  }
  
  const spelled = map[pc]
  return { step: spelled.step, alter: spelled.alter, octave }
}

export function pitchToMidi(p: PitchSpelling) {
  const stepBase: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  }
  return (p.octave + 1) * 12 + stepBase[p.step] + p.alter
}

export function toVexKey(p: PitchSpelling) {
  const step = p.step.toLowerCase()
  const acc = p.alter === 1 ? "#" : p.alter === -1 ? "b" : ""
  return `${step}${acc}/${p.octave}`
}
