import {
  Duration,
  Event,
  Measure,
  Score,
  durToTicks,
  totalTicks,
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

function choiceWeighted<T>(rng: RNG, items: { item: T; w: number }[]): T {
  const total = items.reduce((s, i) => s + i.w, 0)
  let r = rng() * total
  for (const it of items) {
    r -= it.w
    if (r <= 0) return it.item
  }
  return items[items.length - 1].item
}

/* ============================================================
   Time / Scale
============================================================ */

const TS = { beats: 4 as const, beatUnit: 4 as const }
const MEASURE_TICKS = measureTicks(TS)

const SCALE = [0, 2, 4, 5, 7, 9, 11, 12]

/* ============================================================
   Cells (BASE ONLY — upgrades handled separately)
============================================================ */

type Cell = {
  name: string
  relSteps: number[]
  durs: Duration[]
  isRest?: boolean[]
}

const BASE_CELLS: Cell[] = [ // unbounded by difficulty
  { name: "two_quarters_step", relSteps: [0, 1], durs: ["q", "q"] },
  { name: "quarter_and_rest", relSteps: [3, -3], durs: ["q", "q"], isRest: [false, true] },
  { name: "two_quarters_repeat", relSteps: [0, 0], durs: ["q", "q"] },
  { name: "quarter_then_2eighth", relSteps: [0, 1, 0], durs: ["q", "8", "8"] },
  { name: "half_note", relSteps: [0], durs: ["h"] },
]

/* ============================================================
   Cell Upgrade Paths (macro complexity)
============================================================ */

type CellUpgrade = {
  minDifficulty: number
  relSteps: number[]
  durs: Duration[]
  isRest?: boolean[]
}

const CELL_UPGRADES: Record<string, CellUpgrade[]> = {
  two_quarters_step: [
    { minDifficulty: 2, relSteps: [0, 2], durs: ["q", "q"] },
    { minDifficulty: 2, relSteps: [0, 2], durs: ["q", "q"], isRest: [true, false] },
    { minDifficulty: 2, relSteps: [0, 1], durs: ["q.", "8"] },
    { minDifficulty: 2, relSteps: [0, -2], durs: ["q", "q"] },
    { minDifficulty: 2, relSteps: [0, 1, 1], durs: ["8", "8", "q"] },
    { minDifficulty: 2, relSteps: [0, -1, -1], durs: ["8", "8", "q"] },
    { minDifficulty: 2, relSteps: [0, -1, -1], durs: ["8", "8", "q"], isRest: [true, false, false] },
    { minDifficulty: 3, relSteps: [0, 1, 1, 1], durs: ["8t", "8t", "8t", "q"] },
    { minDifficulty: 3, relSteps: [0, -1, -1, -1], durs: ["8t", "8t", "8t", "q"] },
    { minDifficulty: 2, relSteps: [0, -1, -1], durs: ["8", "8", "q"], isRest: [true, false, true] },
    { minDifficulty: 5, relSteps: [0, 1, -2, 1, -2, 1], durs: ["8t", "8t", "8t", "8t", "8t", "8t"] },
  ],
  two_quarters_repeat: [
    { minDifficulty: 3, relSteps: [0, 2, -2, 2], durs: ["8", "8", "8", "8"] },
    { minDifficulty: 3, relSteps: [0, 2, 0, 0], durs: ["8", "8", "8", "8"], isRest: [false, false, true, false] },
    { minDifficulty: 5, relSteps: [0, 0, 0, 0, 0, 0], durs: ["8t", "8t", "8t", "8t", "8t", "8t"], isRest: [false, false, false, true, false, false] },
  ],
  half_note: [
    { minDifficulty: 3, relSteps: [0, 0], durs: ["q", "q"] },
    { minDifficulty: 4, relSteps: [0, 1, -1, -1], durs: ["8", "8", "8", "8"] },
    { minDifficulty: 5, relSteps: [0, 1, -1, -1, 1, 1], durs: ["8t", "8t", "8t", "8t", "8t", "8t"] },
  ],
}

/* ============================================================
   🔒 HARD ASSERTIONS
============================================================ */

function assertRestAlignment(
  name: string,
  durs: Duration[],
  isRest?: boolean[]
) {
  if (isRest && isRest.length !== durs.length) {
    throw new Error(
      `❌ ${name}: isRest length (${isRest.length}) ≠ durs length (${durs.length})`
    )
  }
}

// Base cells
for (const c of BASE_CELLS) {
  assertRestAlignment(c.name, c.durs, c.isRest)
}

// Upgrades
for (const [baseName, upgrades] of Object.entries(CELL_UPGRADES)) {
  const base = BASE_CELLS.find(c => c.name === baseName)
  if (!base) {
    throw new Error(`Upgrade defined for unknown base cell: ${baseName}`)
  }

  const baseTicks = totalTicks(base.durs)

  for (const up of upgrades) {
    assertRestAlignment(`upgrade of ${baseName}`, up.durs, up.isRest)

    const upTicks = totalTicks(up.durs)
    if (upTicks !== baseTicks) {
      throw new Error(
        `❌ Invalid upgrade for "${baseName}": ${upTicks} ticks ≠ ${baseTicks}`
      )
    }
  }
}

/* ============================================================
   Settings
============================================================ */

export type GenerationSettings = {
  bars?: number
  difficulty?: 1 | 2 | 3 | 4 | 5
  centerMidi?: number
  seed?: number
}

/* ============================================================
   Difficulty Weighting
============================================================ */

function difficultyWeight(current: number, upgrade: number): number {
  const distance = current - upgrade
  return Math.pow(0.5, distance)
}

/* ============================================================
   Main Generator
============================================================ */

export function generatePhrase(
  settings: GenerationSettings = {}
): { score: Score; seed: number } {
  const bars = settings.bars ?? 8
  const difficulty = settings.difficulty ?? 2
  const seed = settings.seed ?? Math.floor(Math.random() * 2 ** 31)
  const rng = mulberry32(seed)

  const tonicMidi = settings.centerMidi ?? 72

  let scaleIndex = 0
  let currentMidi = tonicMidi

  const measures: Measure[] = []

  /* ========================================================
     PHASE 1: Skeleton Generation
  ======================================================== */

  const skeleton: Cell[][] = []

  for (let m = 0; m < bars; m++) {
    let used = 0
    const cells: Cell[] = []

    while (used < MEASURE_TICKS) {
      const remaining = MEASURE_TICKS - used

      const candidates = BASE_CELLS.filter(
        c => totalTicks(c.durs) <= remaining
      )

      const cell = candidates[Math.floor(rng() * candidates.length)]
      cells.push(cell)
      used += totalTicks(cell.durs)
    }

    skeleton.push(cells)
  }

  /* ========================================================
     PHASE 2: Cell Upgrades
  ======================================================== */

  const upgraded = skeleton.map(measure =>
    measure.map(cell => {
      const upgrades = CELL_UPGRADES[cell.name]?.filter(
        u => u.minDifficulty <= difficulty
      )
      if (!upgrades || upgrades.length === 0) return cell

      const byDifficulty = new Map<number, CellUpgrade[]>()
      for (const u of upgrades) {
        if (!byDifficulty.has(u.minDifficulty)) {
          byDifficulty.set(u.minDifficulty, [])
        }
        byDifficulty.get(u.minDifficulty)!.push(u)
      }

      let totalWeight = 0
      const bucketWeights = new Map<number, number>()

      for (const d of byDifficulty.keys()) {
        const w = difficultyWeight(difficulty, d)
        bucketWeights.set(d, w)
        totalWeight += w
      }

      const weighted: { item: CellUpgrade; w: number }[] = []

      for (const [d, bucket] of byDifficulty) {
        const bucketProb = bucketWeights.get(d)! / totalWeight
        const perUpgrade = bucketProb / bucket.length
        for (const u of bucket) {
          weighted.push({ item: u, w: perUpgrade })
        }
      }

      return choiceWeighted(rng, weighted)
    })
  )

  /* ========================================================
     PHASE 3: Realization
  ======================================================== */

  for (let m = 0; m < bars; m++) {
    const events: Event[] = []

    for (const cell of upgraded[m]) {
      for (let i = 0; i < cell.durs.length; i++) {
        const dur = cell.durs[i]
        const isRest = cell.isRest?.[i] === true

        if (isRest) {
          events.push({
            kind: "rest",
            dur,
          })
        } else {
          scaleIndex += cell.relSteps[i] ?? 0
          scaleIndex = ((scaleIndex % SCALE.length) + SCALE.length) % SCALE.length
          currentMidi = tonicMidi + SCALE[scaleIndex]

          events.push({
            kind: "note",
            dur,
            pitch: midiToPitchSpelling(currentMidi),
          })
        }
      }
    }

    // HARD validation
    const total = events.reduce((s, e) => s + durToTicks(e.dur), 0)
    if (total !== MEASURE_TICKS) {
      throw new Error(`Measure ${m} invalid length: ${total}`)
    }

    measures.push({ timeSig: TS, events })
  }

  return {
    score: { measures },
    seed,
  }
}
