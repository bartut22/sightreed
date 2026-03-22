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
  pitchToMidi
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

const SCALE = [0, 2, 4, 5, 7, 9, 11]

import { Cell, CellUpgrade, BASE_CELLS, CELL_UPGRADES } from "./cellLibrary"

/* ============================================================
    Difficulty Settings (Range/Leap Size)
============================================================ */

const DIFFICULTY_RANGES: Record<number, { minMidi: number; maxMidi: number }> = {
  1: { minMidi: 69, maxMidi: 76 },
  2: { minMidi: 69, maxMidi: 84 },
  3: { minMidi: 60, maxMidi: 84 },
  4: { minMidi: 60, maxMidi: 96 },
  5: { minMidi: 48, maxMidi: 96 },
};

const MAX_LEAP: Record<number, number> = {
  1: 5,
  2: 7,
  3: 12,
  4: 15,
  5: 18,
};

// Targets for overall difficulty buckets. These are interpreted in the
// same units as `overallDifficulty` at the bottom of this file.
const DIFFICULTY_TARGETS: Record<number, number> = {
  1: 3.35,
  2: 5.668,
  3: 7.467,
  4: 9.266,
  5: 11.065,
  6: 12.864,
};

type DifficultyBand = {
  minTarget: number
  maxTarget: number
  range: number
}

function getDifficultyBand(difficulty: number): DifficultyBand {
  const minTarget =
    DIFFICULTY_TARGETS[difficulty as 1 | 2 | 3 | 4 | 5] ?? DIFFICULTY_TARGETS[1]
  const maxTarget =
    DIFFICULTY_TARGETS[(difficulty + 1) as 2 | 3 | 4 | 5 | 6] ??
    DIFFICULTY_TARGETS[6]

  return {
    minTarget,
    maxTarget,
    range: maxTarget - minTarget,
  }
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

function assertNoteAlignment(
  name: string,
  durs: Duration[],
  scaleDegs: number[]
) {
  if (scaleDegs.length !== durs.length) {
    throw new Error(
      `❌ ${name}: scaleDegs length (${scaleDegs.length}) ≠ durs length (${durs.length})`
    )
  }
}

// Base cells
for (const c of BASE_CELLS) {
  assertRestAlignment(c.name, c.durs, c.isRest)
  assertNoteAlignment(c.name, c.durs, c.scaleDegs)

  const upgrades = CELL_UPGRADES[c.name]
  if (upgrades) {
    const cellMinDiff = c.minDifficulty ?? 1
    const upgradeMinDiff = Math.min(...upgrades.map(u => u.minDifficulty))
    if (cellMinDiff > upgradeMinDiff) {
      throw new Error(
        `❌ ${c.name}: base minDifficulty (${cellMinDiff}) > minimum upgrade difficulty (${upgradeMinDiff})`
      )
    }
  }
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
    assertNoteAlignment(`upgrade of ${baseName}`, up.durs, up.scaleDegs)

    const upTicks = totalTicks(up.durs)
    if (upTicks !== baseTicks) {
      throw new Error(
        `❌ Invalid upgrade for "${baseName}": ${upTicks} ticks ≠ ${baseTicks} (${JSON.stringify(up)})`
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
  seed?: number,
  tempo?: number
}

/* ============================================================
   Debugging
============================================================ */

const DEBUG_UPGRADES = false;

function debugUpgrade(
  bar: number,
  cell: number,
  base: string,
  upgrade?: CellUpgrade,
  predicted?: number
) {
  if (!DEBUG_UPGRADES) return

  if (!upgrade) {
    console.debug(
      `[upgrade] bar=${bar} cell=${cell} base=${base} → (no upgrade)${(predicted ? ` (predDiff=${predicted.toFixed(2)})` : "")}`
    )
  } else {
    console.debug(
      `[upgrade] bar=${bar} cell=${cell} base=${base} → ${JSON.stringify(upgrade)} (predDiff=${predicted?.toFixed(2)})`
    )
  }
}

/* ============================================================
   Difficulty Score
============================================================ */

function repeatedNotePenalty(durScore: number): number {
  let a = 2 / 9;
  let r = 0.2;
  let logTerm = Math.log10((durScore - a) / (1 - a))
  return (r * logTerm + 0.5)
}

function cellDifficulty(cell: Cell | CellUpgrade, prevScaleDeg?: number): number {
  let score = 0
  for (let i = 0; i < cell.durs.length; i++) {
    const dur = cell.durs[i]
    const step = Math.abs(cell.scaleDegs[i] ?? 0)
    const rest = cell.isRest?.[i] === true
    let cellScore = 0;
    let durScore = 0;
    switch (dur) {
      case "h": durScore = 0.3; break
      case "h.": durScore = 0.4; break;
      case "q": durScore = 0.4; break
      case "8": durScore = 0.5; break
      case "16": durScore = 0.4; break
      case "q.": durScore = 0.5; break
      case "8t": durScore = 0.8; break
      case "8.": durScore = 1; break
      default: break;
    }
    if (rest) {
      if (i === 0) {
        cellScore += 2 * durScore; // downbeat rests are more difficult than others
      } else {
        cellScore += 1.5 * durScore; // all rests are more difficult than normal notes
      }
    } else {
      cellScore += durScore; // base score from duration

      const stepScore = step * (3 / 80 * (Math.pow(30 / 8, durScore) - 1));
      cellScore += stepScore; // add score from pitch step, scaled by duration
    }

    // Within-cell: compare to previous note in same cell
    // Across-cell: when i === 0, compare to prevScaleDeg from caller
    const prevDeg = i === 0 ? prevScaleDeg : cell.scaleDegs[i - 1]
    const prevWasRest = i === 0 ? false : cell.isRest?.[i - 1] === true

    if (!rest && prevDeg !== undefined && !prevWasRest && cell.scaleDegs[i] === prevDeg) {
      cellScore = repeatedNotePenalty(durScore) // oops
    }

    score += cellScore;
  }
  return score
}

function totalDifficulty(cells: (Cell | CellUpgrade)[]): number {
  let total = 0
  let prevScaleDeg: number | undefined = undefined
  for (const cell of cells) {
    total += cellDifficulty(cell, prevScaleDeg)
    // last non-rest note of this cell becomes prevScaleDeg for next cell
    for (let i = cell.scaleDegs.length - 1; i >= 0; i--) {
      if (!cell.isRest?.[i]) {
        prevScaleDeg = cell.scaleDegs[i]
        break
      }
    }
  }
  return total
}

/* ============================================================
   Main Generator
============================================================ */

function generatePhraseOnce(
  settings: GenerationSettings = {}
): { score: Score; seed: number; adjDifficulty: number; overallDifficulty: number } {
  const bars = settings.bars ?? 8
  const difficulty = settings.difficulty ?? 2
  const seed = settings.seed ?? Math.floor(Math.random() * 2 ** 31)
  const rng = mulberry32(seed)

  const tonicMidi = settings.centerMidi ?? 72

  // Phrase-level difficulty targets (overall units)
  const tempoMultiplier = (settings.tempo ?? 120) / 120
  const lengthMultiplier = (settings.bars ?? 2) / 2

  const { minTarget, maxTarget, range: targetRange } = getDifficultyBand(difficulty)

  // Convert overall targets into raw cell-difficulty units so the upgrade
  // phase can reason about contributions before the tempo/length scaling.
  const targetMinRaw = (minTarget * lengthMultiplier) / tempoMultiplier
  const targetMaxRaw = (maxTarget * lengthMultiplier) / tempoMultiplier
  const targetMidRaw = (targetMinRaw + targetMaxRaw) / 2

  const measures: Measure[] = []

  /* ========================================================
     PHASE 1: Skeleton Generation
  ======================================================== */

  const skeleton: Cell[][] = []
  let skeletonDiffSoFar = 0

  // Rough estimate of total cells to come (used for per-cell budget)
  // We'll update as we go. 3 cells/bar is a reasonable starting prior.
  let estimatedCellsRemaining = bars * 3

  for (let m = 0; m < bars; m++) {
    let used = 0
    const cells: Cell[] = []

    while (used < MEASURE_TICKS) {
      const remaining = MEASURE_TICKS - used

      const allCandidates = BASE_CELLS.filter(
        c => totalTicks(c.durs) <= remaining && (c.minDifficulty ?? 1) <= difficulty
      )

      if (allCandidates.length === 0) {
        console.warn(`No cells for remaining ${remaining} ticks`)
        break
      }

      // How much raw budget remains before we hit targetMaxRaw?
      const budgetLeft = targetMaxRaw - skeletonDiffSoFar
      // Soft per-cell ceiling — allow a little slack so we don't over-constrain
      const perCellCeiling = (budgetLeft / Math.max(estimatedCellsRemaining, 1)) * 1.4

      // Prefer cells within budget; fall back to all if nothing qualifies
      const budgeted = allCandidates.filter(c => cellDifficulty(c) <= perCellCeiling)
      const pool = budgeted.length > 0 ? budgeted : allCandidates

      const cell = pool[Math.floor(rng() * pool.length)]
      cells.push(cell)
      skeletonDiffSoFar += cellDifficulty(cell)
      used += totalTicks(cell.durs)
      estimatedCellsRemaining = Math.max(estimatedCellsRemaining - 1, 1)
    }

    skeleton.push(cells)
  }

  /* ========================================================
     PHASE 2: Cell Upgrades
  ======================================================== */
  // Flatten skeleton to work with a global difficulty budget across all cells.
  const flatSkeleton = skeleton.flat()
  // console.debug(
  //   `[difficulty] Flat skeleton before upgrades:`,
  //   flatSkeleton.map((cell, i) => ({
  //     index: i,
  //     name: cell.name,
  //     difficulty: cellDifficulty(cell).toFixed(2)
  //   }))
  // )
  const totalCells = flatSkeleton.length
  let prevDeg: number | undefined = undefined
  const baseDifficulties = flatSkeleton.map(cell => {
    const d = cellDifficulty(cell, prevDeg)
    for (let i = cell.scaleDegs.length - 1; i >= 0; i--) {
      if (!cell.isRest?.[i]) { prevDeg = cell.scaleDegs[i]; break }
    }
    return d
  })
  const baseTotalRaw = baseDifficulties.reduce((sum, d) => sum + d, 0)

  let upgraded: CellUpgrade[][] = [];

  // If the skeleton already exceeds the ceiling, skip upgrades entirely.
  if (baseTotalRaw >= targetMaxRaw) {
    console.warn(
      `[difficulty] baseTotalRaw (${baseTotalRaw.toFixed(2)}) >= targetMaxRaw (${targetMaxRaw.toFixed(2)}), skipping upgrades`
    )
    upgraded = skeleton.map(measure => measure.map(cell => cell as CellUpgrade))
    // jump straight to Phase 3...
  } else {

    // Running difficulty budget (in raw units) for the upgrade phase.
    let remainingBudgetLow = targetMinRaw - baseTotalRaw
    let remainingBudgetHigh = targetMaxRaw - baseTotalRaw
    let scoreSoFarRaw = 0
    let basePrefixRaw = 0
    let globalIndex = 0

    // console.log(
    //   `[difficulty] Start upgrading with difficulty=${difficulty}, ` +
    //   `minTarget=${minTarget.toFixed(2)}, maxTarget=${maxTarget.toFixed(2)}, ` +
    //   `targetMinRaw=${targetMinRaw.toFixed(2)}, targetMaxRaw=${targetMaxRaw.toFixed(2)}, ` +
    //   `baseTotalRaw=${baseTotalRaw.toFixed(2)}, totalCells=${totalCells}`
    // )

    upgraded = skeleton.map((measure, m) => {
      return measure.map((cell, c) => {
        const baseDiff = baseDifficulties[globalIndex] ?? cellDifficulty(cell)
        const remainingBaseRaw = baseTotalRaw - (basePrefixRaw + baseDiff)

        const upgrades = CELL_UPGRADES[cell.name]?.filter(u => u.minDifficulty <= difficulty) ?? []

        // Always include the "no upgrade" option (original cell) as a candidate.
        const candidates: CellUpgrade[] = [cell as CellUpgrade, ...upgrades]

        const cellsLeft = Math.max(totalCells - globalIndex, 1)
        const perCellMin = remainingBudgetLow / cellsLeft
        const perCellMax = remainingBudgetHigh / cellsLeft
        const perCellTarget = (perCellMin + perCellMax) / 2

        let bestCandidate = candidates[0]
        let bestScore = Number.POSITIVE_INFINITY
        let bestTotalRaw = scoreSoFarRaw + cellDifficulty(bestCandidate) + remainingBaseRaw

        for (const cand of candidates) {
          const candDiff = cellDifficulty(cand)
          const candidateTotalRaw = scoreSoFarRaw + candDiff + remainingBaseRaw

          // Primary objective: stay close to the global mid-target.
          const globalDeviation = Math.abs(candidateTotalRaw - targetMidRaw)

          // Secondary objective: keep per-cell changes roughly inside the
          // remaining budget band.
          const deltaFromBase = candDiff - baseDiff
          const perCellDeviation = Math.abs(deltaFromBase - perCellTarget)

          // Prefer candidates that stay within the overall min/max band.
          const inBand =
            candidateTotalRaw >= targetMinRaw && candidateTotalRaw <= targetMaxRaw

          const bestInBand =
            bestTotalRaw >= targetMinRaw && bestTotalRaw <= targetMaxRaw

          let score = globalDeviation + 0.25 * perCellDeviation

          if (!bestInBand && inBand) {
            // Strongly prefer staying within the band when the current best is out.
            score -= 1
          }

          if (score < bestScore) {
            bestScore = score
            bestCandidate = cand
            bestTotalRaw = candidateTotalRaw
          }
        }

        const chosenDiff = cellDifficulty(bestCandidate)
        const chosenTotalRaw = scoreSoFarRaw + chosenDiff + remainingBaseRaw

        // Update running budget for the remaining cells.
        remainingBudgetLow = targetMinRaw - chosenTotalRaw
        remainingBudgetHigh = targetMaxRaw - chosenTotalRaw

        // Advance running totals and indices.
        scoreSoFarRaw += chosenDiff
        basePrefixRaw += baseDiff
        globalIndex += 1

        // Only mark `baseName` when we actually choose an upgrade.
        if (bestCandidate !== candidates[0]) {
          bestCandidate.baseName = cell.name
        }

        debugUpgrade(
          m,
          c,
          cell.name,
          bestCandidate !== candidates[0] ? bestCandidate : undefined,
          chosenDiff
        )

        return bestCandidate
      })
    })

    if (DEBUG_UPGRADES) {
      console.debug(
        "[final cells]",
        upgraded.map((measure, m) =>
          measure.map((cell, c) => {
            const baseName =
              BASE_CELLS.find(b => b.name === (cell as any).baseName)?.name ??
              (cell as any).name

            const isUpgrade = (cell as any).baseName !== undefined

            return {
              bar: m,
              cell: c,
              name: baseName,
              upgrade: isUpgrade ? JSON.stringify(cell) : undefined
            }
          })
        )
      )
    }
  }

  /* ========================================================
     PHASE 3: Realization
  ======================================================== */

  for (let m = 0; m < bars; m++) {
    const events: Event[] = []

    for (const cell of upgraded[m]) {
      const { minMidi, maxMidi } = DIFFICULTY_RANGES[difficulty];
      const maxLeap = MAX_LEAP[difficulty];

      for (let i = 0; i < cell.durs.length; i++) {
        const dur = cell.durs[i];
        const isRest = cell.isRest?.[i] === true;

        if (isRest) {
          events.push({ kind: "rest", dur });
        } else {
          let relStep = cell.scaleDegs[i] ?? 0;
          let increment: number;

          if (relStep >= 0) {
            const octaveShift = Math.floor(relStep / SCALE.length);
            const scaleIndex = relStep % SCALE.length;
            increment = SCALE[scaleIndex] + octaveShift * 12;
          } else {
            const absStep = -relStep;
            const octaveShift = -Math.ceil(absStep / SCALE.length);
            const scaleIndex = absStep % SCALE.length;
            increment = (octaveShift + 1) * 12 - (scaleIndex === 0 ? 0 : SCALE[scaleIndex]);
          }

          let midiNote = tonicMidi + increment;

          midiNote = Math.min(
            maxMidi,
            Math.max(
              minMidi,
              midiNote + (
                SCALE.includes(midiNote % 12)
                  ? 0
                  : SCALE.includes((midiNote + 1) % 12) ? 1 : -1
              )
            )
          );

          events.push({
            kind: "note",
            dur,
            pitch: midiToPitchSpelling(midiNote),
          });
        }
      }
    }

    measures.push({ timeSig: TS, events })
  }

  // LOG OVERALL DIFFICULTY
  const range = targetRange

  const overallDifficulty =
    totalDifficulty(upgraded.flat()) * tempoMultiplier / lengthMultiplier


  // 🔍 DEBUG: Log all intermediate values
  console.log('[difficulty] Debug values:', {
    difficulty,
    minTarget,
    maxTarget,
    range: maxTarget - minTarget,
    overallDifficulty,
    tempoMultiplier,
    lengthMultiplier,
    totalCells: upgraded.flat().length,
    rawSum: upgraded.flat().reduce((sum, cell) => sum + cellDifficulty(cell), 0)
  })

  // Handle edge case where range is 0 (difficulty 5 or 6)
  let adjDifficulty: number
  if (range === 0 || isNaN(range)) {
    console.warn(`[difficulty] Range is ${range}, using overallDifficulty directly`)
    adjDifficulty = overallDifficulty
  } else {
    adjDifficulty = difficulty + ((overallDifficulty - minTarget) / range)
  }

  // Validate result
  if (isNaN(adjDifficulty)) {
    console.error('[difficulty] adjDifficulty is NaN!', {
      difficulty,
      overallDifficulty,
      minTarget,
      maxTarget,
      range,
      calculation: `${difficulty} + ((${overallDifficulty} - ${minTarget}) / ${range})`
    })
  }

  if (adjDifficulty < difficulty || adjDifficulty > difficulty + 1) {
    console.warn(`Score ${adjDifficulty.toFixed(2)} is out of range ${difficulty}-${difficulty + 1}!`)
  }

  // console.log(
  //   `[difficulty] adjusted difficulty = ${adjDifficulty.toFixed(2)} (expected between ${difficulty} and ${difficulty + 1})`
  // )

  console.debug(
    `[difficulty] Final upgraded:`,
    upgraded.flat().map((cell, i) => ({
      index: i,
      name: cell.baseName,
      difficulty: cellDifficulty(cell).toFixed(2)
    })),
    flatSkeleton.map((cell, i) => ({
      index: i,
      name: cell.name,
      difficulty: cellDifficulty(cell).toFixed(2)
    }))
  )

  return {
    score: { measures },
    seed,
    adjDifficulty,
    overallDifficulty,
  }
}

type GeneratePhraseMeta = {
  requestedDifficulty: number
  targetDifficultyBand: [number, number]
  actualDifficulty: number
  overallDifficulty: number
  attempts: number
  seedUsed: number
  difficultyOutOfRange: boolean
}

const DIFFICULTY_EPSILON = 0.05
const MAX_DIFFICULTY_RETRIES = 20

export function generatePhrase(
  settings: GenerationSettings = {}
): { score: Score; seed: number; meta?: GeneratePhraseMeta } {
  const requestedDifficulty = settings.difficulty ?? 2
  const baseSeed = settings.seed ?? Math.floor(Math.random() * 2 ** 31)

  type Attempt = ReturnType<typeof generatePhraseOnce> & { seed: number }
  const allAttempts: Attempt[] = []  // ← collect every attempt

  for (let attempt = 0; attempt <= MAX_DIFFICULTY_RETRIES; attempt++) {
    const attemptSeed = baseSeed + attempt
    const result = generatePhraseOnce({ ...settings, seed: attemptSeed })
    allAttempts.push({ ...result, seed: attemptSeed })

    const adj = result.adjDifficulty
    const inRange =
      adj >= requestedDifficulty - DIFFICULTY_EPSILON &&
      adj <= requestedDifficulty + 1 + DIFFICULTY_EPSILON

    if (inRange) {
      return {
        score: result.score,
        seed: baseSeed,
        meta: {
          requestedDifficulty,
          targetDifficultyBand: [requestedDifficulty, requestedDifficulty + 1],
          actualDifficulty: adj,
          overallDifficulty: result.overallDifficulty,
          attempts: attempt + 1,
          seedUsed: attemptSeed,
          difficultyOutOfRange: false,
        },
      }
    }
  }

  // All attempts failed — pick the one whose adjDifficulty was closest
  // to the middle of the target band [requestedDifficulty, requestedDifficulty + 1]
  const bandMid = requestedDifficulty + 0.5
  const best = allAttempts.reduce((prev, curr) =>
    Math.abs(curr.adjDifficulty - bandMid) < Math.abs(prev.adjDifficulty - bandMid)
      ? curr
      : prev
  )

  const meta: GeneratePhraseMeta = {
    requestedDifficulty,
    targetDifficultyBand: [requestedDifficulty, requestedDifficulty + 1],
    actualDifficulty: best.adjDifficulty,
    overallDifficulty: best.overallDifficulty,
    attempts: MAX_DIFFICULTY_RETRIES + 1,
    seedUsed: best.seed,
    difficultyOutOfRange: true,
  }

  console.error('[difficulty] Out of range after retries, using closest attempt', {
    ...meta,
    allAttempts: allAttempts.map(a => ({ seed: a.seed, adj: a.adjDifficulty.toFixed(2) }))
  })

  return {
    score: best.score,
    seed: baseSeed,
    meta,
  }
}

// Dev-only helper to sample difficulty distributions for target tuning.
function sampleDifficultyDistribution(
  difficulty: 1 | 2 | 3 | 4 | 5,
  samples = 100,
  baseSettings: GenerationSettings = {}
) {
  const ENABLE_CALIBRATION = false
  if (!ENABLE_CALIBRATION) return

  const values: number[] = []
  for (let i = 0; i < samples; i++) {
    const seed = i
    const res = generatePhraseOnce({ ...baseSettings, difficulty, seed })
    values.push(res.adjDifficulty)
  }

  const sorted = [...values].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const median = sorted[Math.floor(sorted.length / 2)]

  console.log('[difficulty-calibration]', {
    difficulty,
    samples,
    min,
    median,
    max,
  })
}
