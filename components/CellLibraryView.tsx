import { Key, useState } from "react"
import { BASE_CELLS, CELL_UPGRADES, Cell, CellUpgrade } from "../lib/cellLibrary"
import { CellPreviewRow } from "./CellPreviewRow"
import { upgradeToCell } from "../lib/cellScore"

export function CellLibraryView() {
  // Tracks which base cells are expanded
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({})

  const toggleExpand = (cellName: string) => {
    setExpandedCells(prev => ({
      ...prev,
      [cellName]: !prev[cellName],
    }))
  }

  return (
    <div
      style={{
        overflowY: "auto",
        maxHeight: "100%",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      {BASE_CELLS.map((baseCell: Cell) => {
        const isExpanded = !!expandedCells[baseCell.name]
        const upgrades = CELL_UPGRADES[baseCell.name] || []

        return (
          <div key={baseCell.name} style={{ marginBottom: 24 }}>
            {/* Base cell */}
            <div
              onClick={() => toggleExpand(baseCell.name)}
              style={{ cursor: upgrades.length ? "pointer" : "default" }}
            >
              <CellPreviewRow
                label={baseCell.name + (upgrades.length ? " ▼" : "")}
                cell={baseCell}
              />
            </div>

            {/* Upgrades */}
            {isExpanded && upgrades.length > 0 && (
              <div style={{ marginLeft: 20, marginTop: 8 }}>
                {upgrades.map((upgrade: CellUpgrade, i: Key) => (
                  <CellPreviewRow
                    key={i}
                    label={`Upgrade #${Number(i) + 1} of ${baseCell.name}`}
                    cell={upgradeToCell(baseCell, upgrade)}
                    compact
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
