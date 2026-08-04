#!/usr/bin/env npx tsx

import { writeFileSync } from "fs";
import {
  BASE_CELLS,
  CELL_UPGRADES,
  type CellUpgrade,
} from "./cellLibrary";
import { durToTicks, TICKS_PER_QUARTER } from "./notation";
import type { Duration } from "./notation";
import { generatePhrase } from "./generatePhrase"; 

const NUM_SIMS = parseInt(process.argv[2] ?? "5000");
const DIFFICULTY = parseInt(process.argv[3] ?? "5");
const BARS = parseInt(process.argv[4] ?? "8");

interface CsvRow {
  difficulty: number;
  base_cell: string;
  variant: string;
  beats: number;
  count: number;
  "rarity_%": number;
  "variant_rarity_%_within_base": number;
  "weighted_rarity_%": number;
}

function writeCsv(
  counts: Counts,
  numSims: number,
  difficulty: number,
  filename: string,
) {
  const rows: CsvRow[] = [];

  let totalCellsGenerated = 0;
  for (const variants of Object.values(counts)) {
    for (const count of Object.values(variants)) {
      totalCellsGenerated += count;
    }
  }

  for (const [baseName, variants] of Object.entries(counts)) {
    const totalForBase = Object.values(variants).reduce((a, b) => a + b, 0);

    for (const [variant, count] of Object.entries(variants)) {
      const durs = variantDurs(baseName, variant);
      const beats = cellBeats(durs);

      const rarityPct = (count / totalCellsGenerated) * 100;

      rows.push({
        difficulty: effectiveDifficulty(baseName, variant),
        base_cell: baseName,
        variant,
        beats: parseFloat(beats.toFixed(3)),
        count,
        "rarity_%": parseFloat(rarityPct.toFixed(4)),
        "variant_rarity_%_within_base": parseFloat(
          ((count / totalForBase) * 100).toFixed(4),
        ),
        // weighted = rarity × beats, then we'll normalize below
        "weighted_rarity_%": beats * rarityPct,
      });
    }
  }

  // Normalize weighted_rarity_% so all rows sum to 100
  const totalWeight = rows.reduce((s, r) => s + r["weighted_rarity_%"], 0);

  for (const r of rows) {
    r["weighted_rarity_%"] = parseFloat(
      ((r["weighted_rarity_%"] / totalWeight) * 100).toFixed(4),
    );
  }

  rows.sort((a, b) =>
    a.difficulty !== b.difficulty
      ? a.difficulty - b.difficulty
      : a.base_cell !== b.base_cell
        ? a.base_cell.localeCompare(b.base_cell)
        : a.variant.localeCompare(b.variant),
  );

  const header =
    "difficulty,base_cell,variant,beats,count,rarity_%,variant_rarity_%_within_base,weighted_rarity_%";

  const lines = rows.map((r) =>
    [
      r.difficulty,
      r.base_cell,
      r.variant,
      r.beats,
      r.count,

      r["rarity_%"],
      r["variant_rarity_%_within_base"],
      r["weighted_rarity_%"],
    ].join(","),
  );
  writeFileSync(filename, [header, ...lines].join("\n"));

  console.log(`Wrote ${rows.length} rows to ${filename}`);
}

function cellBeats(durs: Duration[]): number {
  const ticks = durs.reduce((sum, d) => sum + durToTicks(d), 0);
  return ticks / TICKS_PER_QUARTER;
}

function effectiveDifficulty(baseName: string, variant: string): number {
  if (variant === "base") {
    return BASE_CELLS.find((c) => c.baseName === baseName)?.minDifficulty ?? 1;
  }
  const idx = parseInt(variant.split("_")[1]) - 1;
  return CELL_UPGRADES[baseName]?.[idx]?.minDifficulty ?? 1;
}

function variantDurs(baseName: string, variant: string): Duration[] {
  if (variant === "base") {
    return BASE_CELLS.find((c) => c.baseName === baseName)?.durs ?? [];
  }
  const idx = parseInt(variant.split("_")[1]) - 1;
  return CELL_UPGRADES[baseName]?.[idx]?.durs ?? [];
}

type Counts = Record<string, Record<string, number>>;

const observedCells: {
  baseName: string;
  upgrades: { idx: number; upgrade: CellUpgrade }[];
}[] = [];

function simulate(numSims: number, difficulty: number, bars: number): Counts {
  const counts: Counts = {};

  for (let i = 0; i < numSims; i++) {
    const result = generatePhrase({
      difficulty: difficulty as 1 | 2 | 3 | 4 | 5,
      bars: bars,
      instrument: "bbClarinet",
    });

    for (const generatedCell of result.cells) {
      const baseName = generatedCell.baseName;
      if (!baseName) continue;

      let baseCell = observedCells.find((c) => c.baseName === baseName);
      if (baseCell === undefined) {
        // base cell not seen yet
        baseCell = {
          baseName: baseName,
          upgrades: [],
        }
        observedCells.push(baseCell);
      }

      let variant = "base";
      const upgrades = CELL_UPGRADES[baseName] ?? [];

      const upgradeIdx = upgrades.findIndex((u) => u === generatedCell);
      if (upgradeIdx !== -1) {
        variant = `upgrade_${upgradeIdx + 1}`;

        const upgradeSeenBefore = baseCell.upgrades.some(u => u.idx === upgradeIdx);
        if (!upgradeSeenBefore) {
          baseCell.upgrades.push({
            idx: upgradeIdx,
            upgrade: (generatedCell as CellUpgrade)
          })
        }
      }

      if (!counts[baseName]) counts[baseName] = {};
      counts[baseName][variant] = (counts[baseName][variant] ?? 0) + 1;
    }
  }

  return counts;
}

console.log(
  `Simulating ${NUM_SIMS.toLocaleString()} cycles at difficulty ${DIFFICULTY} for ${BARS} bars...`,
);

const t0 = performance.now();

const counts = simulate(NUM_SIMS, DIFFICULTY, BARS);

const filename = `cell_rarities_diff${DIFFICULTY}_bars${BARS}.csv`;
writeCsv(counts, NUM_SIMS, DIFFICULTY, filename);
console.log(`Done after ${performance.now() - t0}ms (${Math.floor((performance.now() - t0) / 1000)}s)`);
