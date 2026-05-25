#!/usr/bin/env npx tsx

import { writeFileSync } from "fs"
import { BASE_CELLS, CELL_UPGRADES, type Cell, type CellUpgrade } from "./cellLibrary"
import { durToTicks, TICKS_PER_QUARTER } from "./notation"
import type { Duration } from "./notation"

const NUM_SIMS   = parseInt(process.argv[2] ?? "100000")
const DIFFICULTY = parseInt(process.argv[3] ?? "5")

// ── Beat length ───────────────────────────────────────────────────────────────

function cellBeats(durs: Duration[]): number {
  const ticks = durs.reduce((sum, d) => sum + durToTicks(d), 0)
  return ticks / TICKS_PER_QUARTER
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEligibleBases(difficulty: number): Cell[] {
  return BASE_CELLS.filter(c => (c.minDifficulty ?? 1) <= difficulty)
}

function getEligibleUpgradeIndices(baseName: string, difficulty: number): number[] {
  const upgrades = CELL_UPGRADES[baseName] ?? []
  return upgrades
    .map((u, i) => ({ u, i }))
    .filter(({ u }) => u.minDifficulty <= difficulty)
    .map(({ i }) => i)
}

function effectiveDifficulty(baseName: string, variant: string): number {
  if (variant === "base") {
    return BASE_CELLS.find(c => c.name === baseName)?.minDifficulty ?? 1
  }
  const idx = parseInt(variant.split("_")[1]) - 1
  return CELL_UPGRADES[baseName]?.[idx]?.minDifficulty ?? 1
}

function variantDurs(baseName: string, variant: string): Duration[] {
  if (variant === "base") {
    return BASE_CELLS.find(c => c.name === baseName)?.durs ?? []
  }
  const idx = parseInt(variant.split("_")[1]) - 1
  return CELL_UPGRADES[baseName]?.[idx]?.durs ?? []
}

// ── Simulation ────────────────────────────────────────────────────────────────

type Counts = Record<string, Record<string, number>>

function simulate(numSims: number, difficulty: number): Counts {
  const counts: Counts = {}
  const eligibleBases = getEligibleBases(difficulty)

  if (eligibleBases.length === 0) {
    console.error(`No base cells available at difficulty ${difficulty}`)
    process.exit(1)
  }

  for (let i = 0; i < numSims; i++) {
    const base = eligibleBases[Math.floor(Math.random() * eligibleBases.length)]
    const name = base.name
    const upgradeIndices = getEligibleUpgradeIndices(name, difficulty)

    const poolSize = 1 + upgradeIndices.length
    const pick = Math.floor(Math.random() * poolSize)
    const variant = pick === 0 ? "base" : `upgrade_${upgradeIndices[pick - 1] + 1}`

    if (!counts[name]) counts[name] = {}
    counts[name][variant] = (counts[name][variant] ?? 0) + 1
  }

  return counts
}

// ── CSV output ────────────────────────────────────────────────────────────────

interface CsvRow {
  difficulty: number
  base_cell: string
  variant: string
  beats: number
  count: number
  "rarity_%": number
  "variant_rarity_%_within_base": number
  "weighted_rarity_%": number
}

function writeCsv(counts: Counts, numSims: number, difficulty: number, filename: string) {
  const rows: CsvRow[] = []

  for (const [baseName, variants] of Object.entries(counts)) {
    const totalForBase = Object.values(variants).reduce((a, b) => a + b, 0)
    for (const [variant, count] of Object.entries(variants)) {
      const durs = variantDurs(baseName, variant)
      const beats = cellBeats(durs)
      const rarityPct = count / numSims * 100
      rows.push({
        difficulty: effectiveDifficulty(baseName, variant),
        base_cell: baseName,
        variant,
        beats: parseFloat(beats.toFixed(3)),
        count,
        "rarity_%": parseFloat(rarityPct.toFixed(4)),
        "variant_rarity_%_within_base": parseFloat((count / totalForBase * 100).toFixed(4)),
        // weighted = rarity × beats, then we'll normalize below
        "weighted_rarity_%": beats * rarityPct,
      })
    }
  }

  // Normalize weighted_rarity_% so all rows sum to 100
  const totalWeight = rows.reduce((s, r) => s + r["weighted_rarity_%"], 0)
  for (const r of rows) {
    r["weighted_rarity_%"] = parseFloat((r["weighted_rarity_%"] / totalWeight * 100).toFixed(4))
  }

  rows.sort((a, b) =>
    a.difficulty !== b.difficulty ? a.difficulty - b.difficulty :
    a.base_cell !== b.base_cell ? a.base_cell.localeCompare(b.base_cell) :
    a.variant.localeCompare(b.variant)
  )

  const header = "difficulty,base_cell,variant,beats,count,rarity_%,variant_rarity_%_within_base,weighted_rarity_%"
  const lines = rows.map(r =>
    [r.difficulty, r.base_cell, r.variant, r.beats, r.count,
     r["rarity_%"], r["variant_rarity_%_within_base"], r["weighted_rarity_%"]].join(",")
  )

  writeFileSync(filename, [header, ...lines].join("\n"))
  console.log(`Wrote ${rows.length} rows to ${filename}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`Simulating ${NUM_SIMS.toLocaleString()} cycles at difficulty ${DIFFICULTY}...`)
const counts = simulate(NUM_SIMS, DIFFICULTY)
const filename = `cell_rarities_diff${DIFFICULTY}.csv`
writeCsv(counts, NUM_SIMS, DIFFICULTY, filename)
console.log("Done.")