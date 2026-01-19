import { PitchSpelling } from "../notation"

const NOTE_STEPS = [0, 2, 4, 5, 7, 9, 11]

/**
 * Convert MIDI note number to diatonic step position
 * @param midi MIDI note number (0-127)
 * @returns diatonic step number for staff positioning
 */
export function midiToDiatonicStep(midi: number): number {
  const octave = Math.floor(midi / 12)
  const pc = ((midi % 12) + 12) % 12
  const step = NOTE_STEPS.findIndex(
    (s, i) => pc >= s && (i === NOTE_STEPS.length - 1 || pc < NOTE_STEPS[i + 1])
  )
  return octave * 7 + step
}

/**
 * Convert pitch spelling to MIDI note number
 * @param p PitchSpelling object with step, octave, and alter
 * @returns MIDI note number
 */
export function pitchToMidi(p: PitchSpelling): number {
  const base: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  }
  return (p.octave + 1) * 12 + base[p.step] + p.alter
}

/**
 * Get accidental symbol from pitch spelling
 * @param p PitchSpelling object
 * @returns "#", "b", or null
 */
export function getAccidentalFromPitch(p: PitchSpelling): string | null {
  if (p.alter === 1) return "#"
  if (p.alter === -1) return "b"
  return null
}

/**
 * Get accidental symbol from MIDI note
 * Used for quick lookups when pitch spelling not available
 */
export function getAccidentalFromMidi(midi: number): string | null {
  const pc = ((midi % 12) + 12) % 12
  if ([1, 3, 6, 8, 10].includes(pc)) return "#"
  return null
}

/**
 * Calculate staff step from MIDI for a given clef
 */
export function stepToY(
  step: number, 
  trebleBottomLineStep: number, 
  staffTop: number, 
  lineSpacing: number
): number {
  return staffTop + 4 * lineSpacing - (step - trebleBottomLineStep) * (lineSpacing / 2)
}
