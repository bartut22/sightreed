import { ArticulationDetector, ArticulationType } from "./articulationDetector"

export type QuantizedNote = {
  kind: "note"
  pitch: number
  startTick: number
  durationTicks: number
  rms: number
  articulation?: ArticulationType
  midiNote?: number
}

export type QuantizedRest = {
  kind: "rest"
  startTick: number
  durationTicks: number
}

export type QuantizedEvent = QuantizedNote | QuantizedRest

function hzToMidi(hz: number): number {
  return Math.round(69 + 12 * Math.log2(hz / 440))
}

export class RhythmQuantizer {
  private tempo: number
  private currentTick = 0
  private msPerTick: number
  
  // Current note tracking
  private currentPitch: number | null = null
  private noteStartTick: number | null = null
  private noteStartRMS: number = 0
  private rmsBuffer: number[] = []
  
  // Finalized events
  private events: QuantizedEvent[] = []
  private articulationDetector: ArticulationDetector

  constructor(tempo: number) {
    this.tempo = tempo
    this.msPerTick = (60000 / tempo) / 48
    this.articulationDetector = new ArticulationDetector()
  }

  update(elapsedMs: number, pitch: number | null, rms: number) {
    const newTick = Math.floor(elapsedMs / this.msPerTick)
    
    if (newTick === this.currentTick) return
    
    this.currentTick = newTick
    this.rmsBuffer.push(rms)
    if (this.rmsBuffer.length > 10) this.rmsBuffer.shift()

    // Handle note state transitions
    if (pitch !== null && rms > 0.02) {
      // Note is playing
      if (this.noteStartTick === null) {
        // New note started
        this.noteStartTick = this.currentTick
        this.currentPitch = pitch
        this.noteStartRMS = rms
      }
      // Note continuing - do nothing
    } else {
      // No note playing
      if (this.noteStartTick !== null) {
        // Note just ended - finalize it
        this.finalizeNote()
      }
    }
  }

  private finalizeNote() {
    if (this.noteStartTick === null || this.currentPitch === null) return

    const durationTicks = this.currentTick - this.noteStartTick
    const expectedDurationTicks = this.roundToNearestDuration(durationTicks)
    
    const onsetSharpness = this.articulationDetector.calculateOnsetSharpness(this.rmsBuffer)
    const articulation = this.articulationDetector.detectArticulation(
      durationTicks,
      expectedDurationTicks,
      this.noteStartRMS,
      onsetSharpness
    )

    this.events.push({
      kind: "note",
      pitch: this.currentPitch,
      startTick: this.noteStartTick,
      durationTicks,
      rms: this.noteStartRMS,
      articulation,
      midiNote: hzToMidi(this.currentPitch)
    })

    // Reset
    this.noteStartTick = null
    this.currentPitch = null
    this.noteStartRMS = 0
  }

  private roundToNearestDuration(ticks: number): number {
    const TICKS_PER_QUARTER = 48
    const validDurations = [
      TICKS_PER_QUARTER / 3,       // triplet
      TICKS_PER_QUARTER / 2,       // eighth
      TICKS_PER_QUARTER * 0.75,    // dotted eighth
      TICKS_PER_QUARTER,           // quarter
      TICKS_PER_QUARTER * 1.5,     // dotted quarter
      TICKS_PER_QUARTER * 2,       // half
      TICKS_PER_QUARTER * 3,       // dotted half
    ]
    
    return validDurations.reduce((prev, curr) => 
      Math.abs(curr - ticks) < Math.abs(prev - ticks) ? curr : prev
    )
  }

  getEvents(): QuantizedEvent[] {
    return this.events
  }

  getCurrentTick(): number {
    return this.currentTick
  }

  reset() {
    this.events = []
    this.currentTick = 0
    this.currentPitch = null
    this.noteStartTick = null
    this.articulationDetector.reset()
    this.rmsBuffer = []
  }
}
