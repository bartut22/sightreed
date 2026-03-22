import { Cell, CellUpgrade } from "./cellLibrary"
import { Score, PitchSpelling, Duration, TimeSig } from "./notation"
import { totalTicks, TICKS_PER_QUARTER } from "./notation"

/**
 * Scale degrees in C major (1 = C)
 */
const C_MAJOR_STEPS: PitchSpelling["step"][] = [
  "C", "D", "E", "F", "G", "A", "B",
]

/**
 * Convert scale degree to PitchSpelling in C major
 * Middle C = C4 by default
 */
export function scaleDegToPitch(
  deg: number,
  baseOctave = 5
): PitchSpelling {
  const index = ((deg % 7) + 7) % 7
  const octaveOffset = Math.floor(deg / 7)

  return {
    step: C_MAJOR_STEPS[index],
    alter: 0,
    octave: baseOctave + octaveOffset,
  }
}

/**
 * Compute a time signature whose duration exactly matches the cell
 * Beat unit is always quarter note (4)
 */
export function cellTimeSig(durs: Duration[]): TimeSig {
  const ticks = totalTicks(durs)
  return {
    beats: ticks / TICKS_PER_QUARTER,
    beatUnit: 4,
  }
}

/**
 * Convert a Cell into a single-measure Score
 */
export function cellToScore(cell: Cell): Score {
  return {
    measures: [
      {
        timeSig: cellTimeSig(cell.durs),
        events: cell.durs.map((dur, i) => {
          if (cell.isRest?.[i]) {
            return { kind: "rest", dur }
          }
          return {
            kind: "note",
            dur,
            pitch: scaleDegToPitch(cell.scaleDegs[i]),
          }
        }),
      },
    ],
  }
}

/**
 * Convert a CellUpgrade into a renderable Cell
 */
export function upgradeToCell(
  base: Cell,
  upgrade: CellUpgrade
): Cell {
  return {
    name: upgrade.baseName ?? base.name,
    scaleDegs: upgrade.scaleDegs,
    durs: upgrade.durs,
    isRest: upgrade.isRest,
    minDifficulty: upgrade.minDifficulty
  }
}
