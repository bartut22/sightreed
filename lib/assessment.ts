import type { TickState } from "./performanceTracker"
import type { Score } from "./notation"
import { durToTicks, pitchToMidi } from "./notation"

export type AssessmentResult = {
  overallScore: number
  pitchAccuracy: number
  rhythmAccuracy: number
  toneQuality: number
  timing: {
    tendency: "rushing" | "dragging" | "on-time"
    avgOffset: number
    description: string
  }
  details: {
    totalTicks: number
    correctTicks: number
    noteTicks: number
    correctNoteTicks: number
    correct: number
    total: number
    avgTimingError: number
    avgDurationAccuracy: number
    avgHNR: number
    centroidConsistency: number
  }
  difficulty: 1 | 2 | 3 | 4 | 5 | undefined
  noteResults: Array<{ tick: number, passed: boolean }>  // ✅ Added
}

export function scoreMultiplierForDifficulty(difficulty: number | undefined): number {
  switch (difficulty) {
    case 1: return 1.0
    case 2: return 1.025
    case 3: return 1.05
    case 4: return 1.075
    case 5: return 1.1
    default: return 1.0
  }
}

export function assessPerformance(
  stateHistory: TickState[],
  baselineCentroid: number,
  baselineHNR: number,
  score: Score,
  difficulty: 1 | 2 | 3 | 4 | 5 | undefined,
  tempo: number = 120
): AssessmentResult {
  if (stateHistory.length === 0) {
    return {
      overallScore: 0,
      pitchAccuracy: 0,
      rhythmAccuracy: 0,
      toneQuality: 0,
      timing: {
        tendency: "on-time",
        avgOffset: 0,
        description: "No data"
      },
      details: {
        totalTicks: 0,
        correctTicks: 0,
        noteTicks: 0,
        correctNoteTicks: 0,
        correct: 0,
        total: 0,
        avgTimingError: 0,
        avgDurationAccuracy: 0,
        avgHNR: 0,
        centroidConsistency: 0,
      },
      difficulty: difficulty,
      noteResults: []  // ✅ Added
    }
  }

  let scoreMultiplier = scoreMultiplierForDifficulty(difficulty)

  const totalTicks = stateHistory.length
  const correctTicks = stateHistory.filter(s => s.isCorrect).length

  const noteTicks = stateHistory.filter(s => s.expectedKind === "note")
  const correctNoteTicks = noteTicks.filter(s => s.isCorrect).length

  const pitchAccuracy = noteTicks.length > 0
    ? (correctNoteTicks / noteTicks.length) * scoreMultiplier
    : 0

  const rhythmAccuracy = totalTicks > 0
    ? correctTicks / totalTicks
    : 0

  const noteStatesWithSpectral = stateHistory.filter(
    s => s.expectedKind === "note" && s.hnr !== undefined && s.centroid !== undefined && s.hnr > 0
  )

  // Build expected note windows
  let currentTick = 0
  const expectedNotes: Array<{ startTick: number, endTick: number, pitch: number }> = []

  for (const measure of score.measures) {
    for (const event of measure.events) {
      if (event.kind === "note") {
        const noteEvent = event as { pitch: any, tiedFrom?: boolean }
        const duration = durToTicks(event.dur)

        if (!noteEvent.tiedFrom) {
          expectedNotes.push({
            startTick: currentTick,
            endTick: currentTick + duration,
            pitch: pitchToMidi(event.pitch)
          })
        } else {
          const lastNote = expectedNotes[expectedNotes.length - 1]
          if (lastNote) {
            lastNote.endTick = currentTick + duration
          }
        }
        currentTick += duration
      } else {
        currentTick += durToTicks(event.dur)
      }
    }
  }

  console.log('Expected notes (with durations):', expectedNotes)

  // Build actual notes played
  const actualNotes: Array<{ startTick: number, endTick: number, pitch: number }> = []
  const MIN_NOTE_GAP = 10

  for (let i = 0; i < stateHistory.length; i++) {
    const curr = stateHistory[i]
    const prev = i > 0 ? stateHistory[i - 1] : null

    const isNoteStart =
      curr.actualPitch !== null &&
      curr.actualRMS > 0.02 &&
      (!prev || prev.actualPitch === null || prev.actualRMS <= 0.02 || prev.actualPitch !== curr.actualPitch)

    if (isNoteStart) {
      const lastNote = actualNotes[actualNotes.length - 1]
      if (!lastNote || curr.tick - lastNote.startTick >= MIN_NOTE_GAP) {
        actualNotes.push({
          startTick: curr.tick,
          endTick: curr.tick,
          pitch: curr.actualPitch!
        })
      }
    }

    if (actualNotes.length > 0) {
      const currentNote = actualNotes[actualNotes.length - 1]
      if (curr.actualPitch === currentNote.pitch && curr.actualRMS > 0.02) {
        currentNote.endTick = curr.tick
      }
    }
  }

  console.log('Actual notes played (with durations):', actualNotes)

  // ✅ Track per-note results
  const noteResults: Array<{ tick: number, passed: boolean }> = []
  const noteTransitions: number[] = []
  let notesCorrect = 0

  for (const expectedNote of expectedNotes) {
    console.log(`Expected note ${expectedNote.pitch} from tick ${expectedNote.startTick} to ${expectedNote.endTick}`)
    const SEARCH_WINDOW = 48

    let firstCorrectTick: number | null = null
    let correctTicks = 0
    let totalTicksInRange = 0
    let pitchDict: { [tick: number]: number | null } = {}

    for (const state of stateHistory) {
      if (state.tick >= expectedNote.startTick - SEARCH_WINDOW &&
        state.tick < expectedNote.endTick + SEARCH_WINDOW) {

        pitchDict[state.tick] = state.actualPitch
        const isCorrectPitch = state.actualPitch === expectedNote.pitch && state.actualRMS > 0.02

        if (isCorrectPitch && firstCorrectTick === null) {
          firstCorrectTick = state.tick
        }

        if (state.tick >= expectedNote.startTick && state.tick < expectedNote.endTick) {
          totalTicksInRange++
          if (isCorrectPitch) {
            correctTicks++
          }
        }
      }
    }

    console.log(`Expected Note ${expectedNote.pitch} from tick ${expectedNote.startTick} to ${expectedNote.endTick}: Player pitches in range:`, JSON.stringify(pitchDict))

    if (firstCorrectTick !== null) {
      const timingOffset = firstCorrectTick - expectedNote.startTick
      noteTransitions.push(timingOffset)
    }

    const accuracy = totalTicksInRange > 0 ? correctTicks / totalTicksInRange : 0
    const wasNotePlayedCorrectly = accuracy >= 0.5

    if (wasNotePlayedCorrectly && firstCorrectTick !== null) {
      notesCorrect++
    }
    
    // ✅ Store result for this note
    noteResults.push({
      tick: expectedNote.startTick,
      passed: wasNotePlayedCorrectly
    })
    
    console.log(`Note at tick ${expectedNote.startTick} (pitch ${expectedNote.pitch}): ${correctTicks}/${totalTicksInRange} ticks correct (${wasNotePlayedCorrectly ? 'PASS' : 'FAIL'}), timing offset: ${firstCorrectTick !== null ? firstCorrectTick - expectedNote.startTick : 'MISSED'}`)
  }

  console.log('Timing Offsets (in ticks):', noteTransitions)
  console.log('Total Notes Correct:', notesCorrect, 'out of', expectedNotes.length)

  let avgOffset = 0
  let tendency: "rushing" | "dragging" | "on-time" = "on-time"
  let description = "Excellent timing!"

  if (noteTransitions.length > 0) {
    avgOffset = noteTransitions.reduce((sum, offset) => sum + offset, 0) / noteTransitions.length

    const variance = noteTransitions.reduce((sum, offset) =>
      sum + Math.pow(offset - avgOffset, 2), 0
    ) / noteTransitions.length
    const stdDev = Math.sqrt(variance)

    const rushingNotes = noteTransitions.filter(offset => offset < -3).length
    const draggingNotes = noteTransitions.filter(offset => offset > 3).length
    const onTimeNotes = noteTransitions.length - rushingNotes - draggingNotes

    const msPerTick = (60000 / tempo) / 48
    console.log('Timing stats:', {
      avgOffset: avgOffset.toFixed(1),
      stdDev: stdDev.toFixed(1),
      rushing: rushingNotes,
      dragging: draggingNotes,
      onTime: onTimeNotes
    })

    const TENDENCY_THRESHOLD = 3
    const CONSISTENCY_THRESHOLD = 5

    if (Math.abs(avgOffset) > TENDENCY_THRESHOLD) {
      tendency = avgOffset > 0 ? "dragging" : "rushing"
      const ms = Math.round(Math.abs(avgOffset) * msPerTick)
      description = `Playing ${ms}ms ${tendency === "dragging" ? "behind" : "ahead of"} the beat`
    } else {
      tendency = "on-time"

      if (stdDev > CONSISTENCY_THRESHOLD) {
        if (rushingNotes > draggingNotes * 1.5) {
          description = "Inconsistent timing (rushing more often)"
        } else if (draggingNotes > rushingNotes * 1.5) {
          description = "Inconsistent timing (dragging more often)"
        } else {
          description = "Inconsistent timing (both rushing and dragging)"
        }
      } else {
        description = "Great tempo control!"
      }
    }
  }

  if (noteStatesWithSpectral.length === 0) {
    return {
      overallScore: 0,
      pitchAccuracy: 0,
      rhythmAccuracy: 0,
      toneQuality: 0,
      timing: { tendency, avgOffset, description },
      details: {
        totalTicks,
        correctTicks,
        noteTicks: noteTicks.length,
        correctNoteTicks,
        correct: notesCorrect,
        total: expectedNotes.length,
        avgTimingError: 0,
        avgDurationAccuracy: 100,
        avgHNR: 0,
        centroidConsistency: 0,
      },
      difficulty: difficulty,
      noteResults  // ✅ Added
    }
  }

  // HNR Score
  const avgHNR = noteStatesWithSpectral.reduce((sum, s) => sum + s.hnr!, 0) / noteStatesWithSpectral.length
  const hnrScore = Math.min(1, Math.max(0, avgHNR / 25))

  // Centroid Consistency
  const avgCentroid = noteStatesWithSpectral.reduce((sum, s) => sum + s.centroid!, 0) / noteStatesWithSpectral.length
  const centroidVariance = noteStatesWithSpectral.reduce(
    (sum, s) => sum + Math.pow(s.centroid! - avgCentroid, 2),
    0
  ) / noteStatesWithSpectral.length
  const centroidStdDev = Math.sqrt(centroidVariance)

  const centroidCV = avgCentroid > 0 ? centroidStdDev / avgCentroid : 1
  const centroidConsistency = Math.max(0, 1 - centroidCV * 1.5)

  const toneQuality = (hnrScore * 0.6 + centroidConsistency * 0.4) * 1.1

  const rawScore = (pitchAccuracy * 0.5 + rhythmAccuracy * 0.3 + toneQuality * 0.2)
  const overallScore = Math.min(100, (rawScore * 100))

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    pitchAccuracy: Math.round(pitchAccuracy * 10000) / 100,
    rhythmAccuracy: Math.round(rhythmAccuracy * 10000) / 100,
    toneQuality: Math.round(toneQuality * 10000) / 100,
    timing: { tendency, avgOffset: Math.round(avgOffset * 10) / 10, description },
    details: {
      totalTicks,
      correctTicks,
      noteTicks: noteTicks.length,
      correctNoteTicks,
      correct: notesCorrect,
      total: expectedNotes.length,
      avgTimingError: 0,
      avgDurationAccuracy: 100,
      avgHNR: Math.round(avgHNR * 10) / 10,
      centroidConsistency: Math.round(centroidConsistency * 100)
    },
    difficulty: difficulty,
    noteResults  // ✅ Added
  }
}
