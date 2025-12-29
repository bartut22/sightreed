import type { Score, Event } from "./notation"
import { durToTicks, pitchToMidi } from "./notation"

export type TickState = {
  tick: number
  rawTick: number
  expectedKind: "note" | "rest" | null
  expectedPitch: number | null // MIDI
  actualPitch: number | null // MIDI
  actualRMS: number
  isCorrect: boolean
  centroid?: number
  hnr?: number
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
  private lastUpdateTime = 0
  private msPerTick: number

  // ✅ TWO-STAGE LATENCY COMPENSATION
  private calibratedLatencyMs: number // From calibration tap test
  private calibratedLatencyTicks: number // Converted to ticks
  private firstNoteOffsetTicks: number | null = null // Per-performance fine-tuning
  private firstSoundDetectedTick: number | null = null

  // State history for analysis
  private stateHistory: TickState[] = []

  constructor(score: Score, tempo: number, transposeSemitones: number = 0, calibratedLatencyMs: number = 0) {
    this.score = score
    this.tempo = tempo
    this.msPerTick = (60000 / tempo) / 48 // 48 ticks per quarter note
    this.transposeSemitones = transposeSemitones
    this.calibratedLatencyMs = calibratedLatencyMs
    this.calibratedLatencyTicks = Math.round(calibratedLatencyMs / this.msPerTick)
  }

  start() {
    this.performanceStartTime = performance.now()
    this.hasStarted = true
    this.currentTick = 0
    this.lastUpdateTime = 0
    this.firstNoteOffsetTicks = null
    this.firstSoundDetectedTick = null
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

    // ✅ TWO-STAGE LATENCY COMPENSATION
    // Stage 1: Apply calibrated latency (from tap test)
    let adjustedTick = this.currentTick - this.calibratedLatencyTicks

    // Stage 2: First-note detection (fine-tune per performance)
    if (this.firstNoteOffsetTicks === null && pitch !== null && rms > 0.02) {
      this.firstSoundDetectedTick = adjustedTick

      const SNAP_THRESHOLD = 30 // ~375ms at 120 BPM

      // If first sound is within threshold of score start, snap to beat 1
      if (adjustedTick >= 0 && adjustedTick <= SNAP_THRESHOLD) {
        this.firstNoteOffsetTicks = adjustedTick
        console.log(`🎯 Two-stage latency:`)
        console.log(`  - Calibrated: ${this.calibratedLatencyMs}ms (${this.calibratedLatencyTicks} ticks)`)
        console.log(`  - First-note: ${this.firstNoteOffsetTicks} ticks`)
        console.log(`  - Total: ${this.calibratedLatencyTicks + this.firstNoteOffsetTicks} ticks (${((this.calibratedLatencyTicks + this.firstNoteOffsetTicks) * this.msPerTick).toFixed(0)}ms)`)
      } else if (adjustedTick < 0) {
        // Started before expected (unlikely but possible)
        this.firstNoteOffsetTicks = 0
        console.log(`⏱️ Started early: adjustedTick=${adjustedTick}`)
      } else {
        // Started significantly late - don't compensate
        this.firstNoteOffsetTicks = 0
        console.log(`⏰ Late entry at tick ${adjustedTick}, no additional compensation`)
      }
    }

    // ✅ Apply both compensations
    const correctedTick = this.firstNoteOffsetTicks !== null
      ? adjustedTick - this.firstNoteOffsetTicks
      : adjustedTick

    // Get expected state at the CORRECTED tick
    const expectedState = this.getExpectedStateAtTick(correctedTick)
    const actualPitchMidi = pitch !== null ? this.hzToMidi(pitch) + this.transposeSemitones : null

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
      tick: correctedTick,
      rawTick: this.currentTick,
      expectedKind: expectedState.kind,
      expectedPitch: expectedState.pitch,
      actualPitch: actualPitchMidi,
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
