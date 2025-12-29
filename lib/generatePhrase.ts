import {
  Duration,
  Event,
  Measure,
  Score,
  durToTicks,
  measureTicks,
  midiToPitchSpelling,
  NoteEvent,
} from "./notation"

type RNG = () => number

function mulberry32(seed: number): RNG {
  let t = seed >>> 0
  return function () {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function choiceWeighted<T>(rng: RNG, items: Array<{ item: T; w: number }>) {
  const total = items.reduce((a, b) => a + b.w, 0)
  let r = rng() * total
  for (const it of items) {
    r -= it.w
    if (r <= 0) return it.item
  }
  return items[items.length - 1].item
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

const TS = { beats: 4 as const, beatUnit: 4 as const }
const MEASURE_TICKS = measureTicks(TS) // Now 192 ticks (4 × 48)
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12]

type Cell = {
  name: string
  relScaleSteps: number[]
  durs: Duration[]
  difficulty: number
  hasTriplets?: boolean
}

const CELLS: Cell[] = [
  // ===== LEVEL 1 - Simple quarters only =====
  { name: "two_quarters_step", relScaleSteps: [0, 1], durs: ["q", "q"], difficulty: 1 },
  { name: "two_quarters_repeat", relScaleSteps: [0, 0], durs: ["q", "q"], difficulty: 1 },
  { name: "half_note", relScaleSteps: [0], durs: ["h"], difficulty: 1 },

  // ===== LEVEL 2 - Mix quarters and eighths =====
  { name: "quarter_then_2eighth", relScaleSteps: [0, 1, 0], durs: ["q", "8", "8"], difficulty: 2 },
  { name: "2eighth_then_quarter", relScaleSteps: [0, 1, 2], durs: ["8", "8", "q"], difficulty: 2 },
  { name: "dotted_quarter_eighth", relScaleSteps: [0, 1], durs: ["q.", "8"], difficulty: 2 },
  { name: "2eighths_step", relScaleSteps: [0, 1], durs: ["8", "8"], difficulty: 2 },

  // ===== LEVEL 3 - Four eighths, dotted rhythms =====
  { name: "up_step_4x8", relScaleSteps: [0, 1, 2, 3], durs: ["8", "8", "8", "8"], difficulty: 3 },
  { name: "down_step_4x8", relScaleSteps: [0, -1, -2, -3], durs: ["8", "8", "8", "8"], difficulty: 3 },
  { name: "neighbor", relScaleSteps: [0, 1, 0, -1], durs: ["8", "8", "8", "8"], difficulty: 3 },
  { name: "eighth_dotted_eighth", relScaleSteps: [0, 1, 2], durs: ["8", "8.", "8"], difficulty: 3 },
  { name: "dotted_half", relScaleSteps: [0], durs: ["h."], difficulty: 3 },

  // ===== LEVEL 4 - Triplets, arpeggios, leaps =====
  { name: "eighth_triplet_step", relScaleSteps: [0, 1, 2], durs: ["8t", "8t", "8t"], difficulty: 4, hasTriplets: true },
  { name: "eighth_triplet_neighbor", relScaleSteps: [0, 1, 0], durs: ["8t", "8t", "8t"], difficulty: 4, hasTriplets: true },
  { name: "arpeggio_up_8", relScaleSteps: [0, 2, 4], durs: ["8", "8", "q"], difficulty: 4 },
  { name: "arpeggio_down_8", relScaleSteps: [0, -2, -4], durs: ["8", "8", "q"], difficulty: 4 },
  { name: "arpeggio_up_4x8", relScaleSteps: [0, 2, 4, 2], durs: ["8", "8", "8", "8"], difficulty: 4 },
  { name: "arpeggio_down_4x8", relScaleSteps: [0, -2, -4, -2], durs: ["8", "8", "8", "8"], difficulty: 4 },
  { name: "third_leap_up", relScaleSteps: [0, 2], durs: ["q", "q"], difficulty: 4 },
  { name: "third_leap_down", relScaleSteps: [0, -2], durs: ["q", "q"], difficulty: 4 },
  { name: "fourth_leap", relScaleSteps: [0, 3], durs: ["q", "q"], difficulty: 4 },

  // ===== LEVEL 5 - Complex: wide leaps, triplets, syncopation =====
  { name: "eighth_triplet_arpeggio", relScaleSteps: [0, 2, 4], durs: ["8t", "8t", "8t"], difficulty: 5, hasTriplets: true },
  { name: "quarter_eighth_triplets_quarter", relScaleSteps: [0, 1, 2, 3], durs: ["q", "8t", "8t", "8t"], difficulty: 5, hasTriplets: true },
  { name: "octave_leap", relScaleSteps: [0, 7], durs: ["q", "q"], difficulty: 5 },
  { name: "fifth_leap", relScaleSteps: [0, 4], durs: ["q", "q"], difficulty: 5 },
  { name: "eigths_octave_leap", relScaleSteps: [0, 7], durs: ["8", "8"], difficulty: 5 },
  { name: "eights_fifth_leap", relScaleSteps: [0, 4], durs: ["8", "8"], difficulty: 5 },
  { name: "wide_arpeggio", relScaleSteps: [0, 2, 4, 6], durs: ["8", "8", "8", "8"], difficulty: 5 },
  { name: "sixth_leap", relScaleSteps: [0, 5], durs: ["q", "q"], difficulty: 5 },
]

function cellTicks(cell: Cell) {
  return cell.durs.reduce((s, d) => s + durToTicks(d), 0)
}

type DifficultyProfile = {
  name: string
  restProb: number
  rangeSemitones: number
  allowedCells: (cell: Cell) => boolean
  complexityBias: number
}

const DIFFICULTY_PROFILES: Record<number, DifficultyProfile> = {
  1: {
    name: "Beginner",
    restProb: 0.05,
    rangeSemitones: 7,
    allowedCells: (c) => c.difficulty <= 1,
    complexityBias: 1.0
  },
  2: {
    name: "Elementary",
    restProb: 0.10,
    rangeSemitones: 9,
    allowedCells: (c) => c.difficulty <= 2,
    complexityBias: 1.2
  },
  3: {
    name: "Intermediate",
    restProb: 0.15,
    rangeSemitones: 12,
    allowedCells: (c) => c.difficulty <= 3,
    complexityBias: 1.5
  },
  4: {
    name: "Advanced",
    restProb: 0.20,
    rangeSemitones: 18,
    allowedCells: (c) => 2 <= c.difficulty && c.difficulty <= 4,
    complexityBias: 2.5
  },
  5: {
    name: "Expert",
    restProb: 0.25,
    rangeSemitones: 24,
    allowedCells: (c) => 3 <= c.difficulty && c.difficulty <= 5,
    complexityBias: 3.0
  }
}

export type GenerationSettings = {
  bars?: number
  difficulty?: 1 | 2 | 3 | 4 | 5
  centerMidi?: number
  seed?: number
}

export function generatePhrase(settings: GenerationSettings = {}): { score: Score; seed: number } {
  const bars = settings.bars ?? 8
  const difficulty = settings.difficulty ?? 2
  const centerMidi = settings.centerMidi ?? 72
  const seed = settings.seed ?? Math.floor(Math.random() * 2 ** 31)
  const rng = mulberry32(seed)

  const profile = DIFFICULTY_PROFILES[difficulty]
  const tonicMidi = centerMidi - ((centerMidi % 12) + 12) % 12
  // console.log(`Generating phrase with seed ${seed}, difficulty ${profile.name}, tonic ${midiToPitchSpelling(tonicMidi).step}${midiToPitchSpelling(tonicMidi).octave}`)
  const lowMidi = tonicMidi - Math.floor(profile.rangeSemitones / 2)
  const highMidi = tonicMidi + Math.floor(profile.rangeSemitones / 2)
  // console.log(` Allowed MIDI range: ${lowMidi} to ${highMidi} (${midiToPitchSpelling(lowMidi).step}${midiToPitchSpelling(lowMidi).octave} to ${midiToPitchSpelling(highMidi).step}${midiToPitchSpelling(highMidi).octave})`)

  let currentScaleIndex = 0
  let currentMidi = tonicMidi + SCALE[currentScaleIndex]

  const measures: Measure[] = []

  for (let m = 0; m < bars; m++) {
    const events: Event[] = []
    let used = 0

    while (true) {
      if (used >= MEASURE_TICKS) {
        break
      }

      const remaining = MEASURE_TICKS - used

      // Filter by difficulty
      let candidates = CELLS.filter((c) => profile.allowedCells(c))

      // Filter by size
      candidates = candidates.filter((c) => cellTicks(c) <= remaining)

      // Filter by fillable remainder (UPDATED FOR 48 TICKS PER QUARTER)
      candidates = candidates.filter((c) => {
        const cellSize = cellTicks(c)
        const remainderAfter = remaining - cellSize
        // Valid remainders: 0, 16 (triplet), 24 (8th), 36 (8.), 48 (q), 72 (q.), 96 (h), 144 (h.)
        return [0, 16, 24, 36, 48, 72, 96, 144].includes(remainderAfter)
      })

      // Triplets only on beat boundaries (UPDATED FOR 48 TICKS PER QUARTER)
      candidates = candidates.filter((c) => {
        if (!c.hasTriplets) return true
        // Beats are at 0, 48, 96, 144 in the new system
        return [0, 48, 96, 144].includes(used)
      })

      // No triplets at phrase start
      if (m === 0 && events.length === 0) {
        candidates = candidates.filter(c => !c.hasTriplets)
      }

      const weightedCandidates = candidates.map((c) => ({
        item: c,
        w: Math.pow(profile.complexityBias, c.difficulty - 1)
      }))

      let cell = null
      try {
        cell = choiceWeighted(rng, weightedCandidates)
        // console.log(` Chose cell: ${cell.name} (difficulty ${cell.difficulty}, length ${cellTicks(cell)}) to fill ${remaining} ticks.`)
      } catch (e) {
        console.error(`❌ No candidates to fill ${remaining} ticks at measure ${m}, used ${used} ticks so far.`)
        console.error(` Candidates were: ${candidates.map(c => c.name).join(", ")}`)
        break
      }


      // Add cell events
      for (let i = 0; i < cell.durs.length; i++) {
        const dur = cell.durs[i]
        // console.log(` Adding event: dur=${dur} `)
        const ticksToAdd = durToTicks(dur)

        const delta = cell.relScaleSteps[i] ?? 0
        currentScaleIndex += delta

        // Track octave separately from scale position
        let octaveOffset = 0
        while (currentScaleIndex < 0) {
          currentScaleIndex += SCALE.length
          octaveOffset -= 12
        }
        while (currentScaleIndex >= SCALE.length) {
          currentScaleIndex -= SCALE.length
          octaveOffset += 12
        }

        // Calculate MIDI with correct octave
        currentMidi = tonicMidi + SCALE[currentScaleIndex] + octaveOffset

        // Clamp to nearest valid octave (keeping the scale degree)
        while (currentMidi < lowMidi) currentMidi += 12
        while (currentMidi > highMidi) currentMidi -= 12

        // If still out of range, find nearest in-scale note
        if (currentMidi < lowMidi || currentMidi > highMidi) {
          // Try one octave up/down
          const tryUp = currentMidi + 12
          const tryDown = currentMidi - 12

          if (tryUp >= lowMidi && tryUp <= highMidi) {
            currentMidi = tryUp
          } else if (tryDown >= lowMidi && tryDown <= highMidi) {
            currentMidi = tryDown
          } else {
            // Fallback: find closest valid scale note in range
            let closestDist = Infinity
            let closestMidi = currentMidi
            for (let octave = -2; octave <= 2; octave++) {
              const testMidi = tonicMidi + SCALE[currentScaleIndex] + octave * 12
              if (testMidi >= lowMidi && testMidi <= highMidi) {
                const dist = Math.abs(testMidi - currentMidi)
                if (dist < closestDist) {
                  closestDist = dist
                  closestMidi = testMidi
                }
              }
            }
            currentMidi = closestMidi
          }
        }

        const isFirstEvent = m === 0 && events.length === 0

        if (!isFirstEvent && rng() < profile.restProb) {
          // console.log(` Instead, inserting rest of dur=${dur} `)
          events.push({ kind: "rest", dur })
        } else {
          events.push({ kind: "note", dur, pitch: midiToPitchSpelling(currentMidi) })
        }

        used += ticksToAdd
      }
    }

    // Merge consecutive eighth rests into quarter rests (UPDATED FOR 48 TICKS)
    const merged: Event[] = []
    let i = 0
    while (i < events.length) {
      const e1 = events[i]
      const e2 = events[i + 1]
      let tickPos = merged.reduce((sum, ev) => sum + durToTicks(ev.dur), 0)

      // Merge two eighth rests (24 ticks each) into quarter rest (48 ticks) on beat boundaries
      if (e1.kind === "rest" && e1.dur === "8" && e2?.kind === "rest" && e2.dur === "8" && tickPos % 48 === 0) {
        merged.push({ kind: "rest", dur: "q" })
        i += 2
      } else {
        merged.push(e1)
        i++
      }
    }

    // Validate measure length
    const finalTicks = merged.reduce((sum, e) => sum + durToTicks(e.dur), 0)
    if (finalTicks !== MEASURE_TICKS) {
      console.error(`❌ MEASURE ${m} AFTER MERGE: ${finalTicks} ticks (expected ${MEASURE_TICKS})`)
    }

    measures.push({ timeSig: TS, events: merged })
  }

  // Add ties over bar lines where needed (for readability)
  for (let m = 0; m < measures.length - 1; m++) {
    const currMeasure = measures[m]
    const nextMeasure = measures[m + 1]

    const lastEvent = currMeasure.events[currMeasure.events.length - 1]
    const firstNextEvent = nextMeasure.events[0]

    // Only tie if both are notes with same pitch
    if (
      lastEvent?.kind === "note" &&
      firstNextEvent?.kind === "note" &&
      lastEvent.pitch.step === firstNextEvent.pitch.step &&
      lastEvent.pitch.octave === firstNextEvent.pitch.octave &&
      lastEvent.pitch.alter === firstNextEvent.pitch.alter
    ) {
      // 30% chance to tie for musical variety
      if (rng() < 0.3) {
        (lastEvent as NoteEvent).tiedTo = true;
        (firstNextEvent as NoteEvent).tiedFrom = true
      }
    }
  }

  // Force cadence on last note
  const lastMeasure = measures[bars - 1]
  for (let i = lastMeasure.events.length - 1; i >= 0; i--) {
    const e = lastMeasure.events[i]
    if (e.kind === "note") break
    if (e.kind === "rest") {
      lastMeasure.events[i] = { kind: "note", dur: e.dur, pitch: midiToPitchSpelling(tonicMidi) }
      break
    }
  }

  return { score: { measures }, seed }
}
