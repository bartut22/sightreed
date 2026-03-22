import type { Score, Event } from "./notation"
import { durToTicks, pitchToMidi } from "./notation"

export type TickState = {
  tick: number
  rawTick: number
  expectedKind: "note" | "rest" | null
  expectedPitch: number | null // MIDI
  actualPitch: number | null // MIDI
  actualHz: number | null
  actualRMS: number
  isCorrect: boolean
  centroid?: number
  hnr?: number
}

export type PlayedNoteBlock = {
  startTick: number
  endTick: number
  midi: number
}

export function buildPlayedBlocksFromStateHistory(stateHistory: TickState[]): PlayedNoteBlock[] {
  const actualNotes: PlayedNoteBlock[] = []
  const RMS_THRESHOLD = 0.02
  const RMS_ONSET_MIN = 0.035
  const RMS_RISE_THRESHOLD = 0.015
  const PITCH_TOLERANCE = 1
  const GAP_TICKS = 6
  const MIN_NOTE_GAP = 4
  const MIN_NOTE_TICKS = 6
  let current: PlayedNoteBlock | null = null
  let lastSoundTick = 0
  let gapTicks = 0

  for (let i = 0; i < stateHistory.length; i++) {
    const curr = stateHistory[i]
    const prev = i > 0 ? stateHistory[i - 1] : null
    const hasPitch = curr.actualPitch !== null && curr.actualRMS > RMS_THRESHOLD
    const rmsRise = prev ? (curr.actualRMS - prev.actualRMS) : 0
    const onset =
      curr.actualRMS >= RMS_ONSET_MIN &&
      rmsRise >= RMS_RISE_THRESHOLD &&
      prev !== null &&
      (prev.actualPitch === null || prev.actualRMS <= RMS_THRESHOLD || prev.actualPitch === curr.actualPitch)

    if (hasPitch && curr.actualPitch !== null) {
      if (!current) {
        const lastNote = actualNotes[actualNotes.length - 1]
        if (!lastNote || curr.tick - lastNote.startTick >= MIN_NOTE_GAP) {
          current = {
            startTick: curr.tick,
            endTick: curr.tick,
            midi: curr.actualPitch
          }
        }
      } else if (Math.abs(curr.actualPitch - current.midi) <= PITCH_TOLERANCE) {
        if (onset && curr.tick - current.startTick >= MIN_NOTE_GAP) {
          if (current.endTick - current.startTick + 1 >= MIN_NOTE_TICKS) {
            actualNotes.push(current)
          }
          current = {
            startTick: curr.tick,
            endTick: curr.tick,
            midi: curr.actualPitch
          }
        } else {
          current.endTick = curr.tick
        }
      } else {
        if (current.endTick - current.startTick + 1 >= MIN_NOTE_TICKS) {
          actualNotes.push(current)
        }
        current = {
          startTick: curr.tick,
          endTick: curr.tick,
          midi: curr.actualPitch
        }
      }
      lastSoundTick = curr.tick
      gapTicks = 0
    } else if (current) {
      gapTicks = curr.tick - lastSoundTick
      if (gapTicks > GAP_TICKS) {
        if (current.endTick - current.startTick + 1 >= MIN_NOTE_TICKS) {
          actualNotes.push(current)
        }
        current = null
      }
    }
  }

  if (current && current.endTick - current.startTick + 1 >= MIN_NOTE_TICKS) {
    actualNotes.push(current)
  }

  return actualNotes
}

export class PerformanceTracker {
  private score: Score
  private tempo: number
  private transposeSemitones: number
  private performanceStartTime = 0
  private hasStarted = false
  private currentCentroid = 0
  private currentHNR = 0

  // Tick-based tracking
  private currentTick = 0
  private msPerTick: number

  // State history for analysis
  private stateHistory: TickState[] = []

  constructor(score: Score, tempo: number, transposeSemitones: number = 0) {
    this.score = score
    this.tempo = tempo
    this.msPerTick = (60000 / tempo) / 48 // 48 ticks per quarter note
    this.transposeSemitones = transposeSemitones
  }

  start() {
    this.performanceStartTime = performance.now()
    this.hasStarted = true
    this.currentTick = 0
    this.stateHistory = []
  }

  updateSpectral(centroid: number, hnr: number) {
    this.currentCentroid = centroid
    this.currentHNR = hnr
  }

  update(pitch: number | null, rms: number) {
    if (!this.hasStarted) return

    const elapsedMs = performance.now() - this.performanceStartTime
    const newTick = Math.floor(elapsedMs / this.msPerTick)

    if (newTick === this.currentTick) return // No new tick yet

    this.currentTick = newTick

    // Get expected state at the CORRECTED tick
    const expectedState = this.getExpectedStateAtTick(this.currentTick)
    const actualPitchMidi = pitch !== null ? this.hzToMidi(pitch) - this.transposeSemitones : null

    // Determine if correct
    let isCorrect = false
    if (expectedState.kind === "note") {
      if (actualPitchMidi !== null && expectedState.pitch !== null) {
        isCorrect = Math.abs(actualPitchMidi - expectedState.pitch) <= 1
      }
    } else if (expectedState.kind === "rest") {
      isCorrect = actualPitchMidi === null || rms < 0.015
    } else {
      isCorrect = true
    }

    // Record this tick's state (using corrected tick)
    this.stateHistory.push({
      tick: this.currentTick,
      rawTick: this.currentTick,
      expectedKind: expectedState.kind,
      expectedPitch: expectedState.pitch,
      actualPitch: actualPitchMidi,
      actualHz: pitch,
      actualRMS: rms,
      isCorrect,
      centroid: this.currentCentroid,
      hnr: this.currentHNR
    })
  }

  private getExpectedStateAtTick(tick: number): {
    kind: "note" | "rest" | null
    pitch: number | null
    event: Event | null
  } {
    let currentTick = 0

    // Walk through score to find what should be playing at this tick
    for (const measure of this.score.measures) {
      for (const event of measure.events) {
        const eventDuration = durToTicks(event.dur)

        if (tick >= currentTick && tick < currentTick + eventDuration) {
          // We're inside this event
          if (event.kind === "note") {
            return {
              kind: "note",
              pitch: pitchToMidi(event.pitch),
              event
            }
          } else {
            return {
              kind: "rest",
              pitch: null,
              event
            }
          }
        }

        currentTick += eventDuration
      }
    }

    // Beyond the score
    return { kind: null, pitch: null, event: null }
  }

  private hzToMidi(hz: number): number {
    return Math.round(69 + 12 * Math.log2(hz / 440))
  }

  // ... rest of methods stay the same
  getStateHistory(): TickState[] {
    return [...this.stateHistory]
  }

  getAccuracy(): number {
    if (this.stateHistory.length === 0) return 0
    const correct = this.stateHistory.filter(s => s.isCorrect).length
    return correct / this.stateHistory.length
  }

  getPitchAccuracy(): number {
    const noteStates = this.stateHistory.filter(s => s.expectedKind === "note")
    if (noteStates.length === 0) return 0
    const correct = noteStates.filter(s => s.isCorrect).length

    console.log('[DEBUG getPitchAccuracy]', {
      totalTicks: this.stateHistory.length,
      noteStateTicks: noteStates.length,        // 0 here = score never matched ticks
      correctTicks: correct,
      sampleNoteState: noteStates[0],           // inspect first note tick
      sampleActualPitch: noteStates[0]?.actualPitch,   // should be a MIDI number
    });

    return correct / noteStates.length
  }

  getRhythmAccuracy(): number {
    const playingCorrectly = this.stateHistory.filter(s => {
      if (s.expectedKind === "note") {
        return s.actualPitch !== null
      } else if (s.expectedKind === "rest") {
        return s.actualPitch === null || s.actualRMS < 0.02
      }
      return true
    }).length

    return this.stateHistory.length > 0
      ? playingCorrectly / this.stateHistory.length
      : 0
  }

  getCurrentTick(): number {
    return this.currentTick
  }

  getElapsedTime(): number {
    if (!this.hasStarted) return 0
    return performance.now() - this.performanceStartTime
  }

  isStarted(): boolean {
    return this.hasStarted
  }

  getMatches() {
    const matches: any[] = []
    let currentMatch: any = null

    for (const state of this.stateHistory) {
      if (state.expectedKind === "note") {
        if (!currentMatch || currentMatch.expectedPitch !== state.expectedPitch) {
          if (currentMatch) matches.push(currentMatch)
          currentMatch = {
            expected: { kind: "note", pitch: state.expectedPitch },
            played: { pitch: state.actualPitch, rms: state.actualRMS },
            pitchCorrect: state.isCorrect,
            timingError: 0,
            durationAccuracy: 1.0
          }
        }
      } else if (currentMatch) {
        matches.push(currentMatch)
        currentMatch = null
      }
    }

    if (currentMatch) matches.push(currentMatch)
    return matches
  }
}
