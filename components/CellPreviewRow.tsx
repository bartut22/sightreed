import { Cell } from "../lib/cellLibrary"
import { CellPreview } from "./CellPreview"
import { Badge } from "./Badge"
import { Duration } from "@/lib/notation"


export type CellPreviewRowProps = {
    label: string
    cell: Cell
    compact?: boolean
}

export function CellPreviewRow({
    label,
    cell,
    compact = false,
}: CellPreviewRowProps) {
    const difficultyText = cell.minDifficulty
        ? cell.minDifficulty === 1 ? "Beginner"
            : cell.minDifficulty === 2 ? "Easy"
                : cell.minDifficulty === 3 ? "Intermediate"
                    : cell.minDifficulty === 4 ? "Hard"
                        : "Expert"
        : "N/A"

    const difficultyColor = cell.minDifficulty
        ? cell.minDifficulty === 1 ? "#2256c5" // Beginner
            : cell.minDifficulty === 2 ? "#22c55e" // Easy
                : cell.minDifficulty === 3 ? "#facc15" // Intermediate
                    : cell.minDifficulty === 4 ? "#ef4444" // Hard
                        : "#9122c5" // Expert
        : "N/A"

    const difficultyBadge = { text: difficultyText, color: difficultyColor }

    const durSymbols: Record<Duration, string> = {
        "8": "♪",
        "q": "♩",
        "16": "𝅘𝅥𝅯",
        "8t": "♪♪♪",
        "h": "𝅗𝅥",
        "8.": "♪.",
        "q.": "♩.",
        "h.": "𝅗𝅥."
    }

    const uniqueDurs = Array.from(new Set(cell.durs))
    const rhythmBadges = uniqueDurs.map((d: Duration, i) => {
        let base = durSymbols[d]
        return <Badge key={i} text={base} color="#0ff" />
    }).filter(Boolean)

    return (
        <div
            style={{
                backgroundColor: "#1a1a1a",
                borderRadius: 12,
                padding: compact ? 8 : 12,
                boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: compact ? 4 : 6,
                }}
            >
                {difficultyBadge && (
                    <Badge text={difficultyBadge.text} color={difficultyBadge.color} />
                )}
                {rhythmBadges.length > 0 && (
                    <div style={{ marginBottom: compact ? 4 : 6, display: "flex", gap: 4 }}>
                        {rhythmBadges}
                    </div>
                )}

                <span style={{ color: "#eee", fontWeight: 500, fontSize: compact ? 12 : 14 }}>
                    {label}
                </span>
            </div>

            <CellPreview
                cell={cell}
                compact={compact}
                height={compact ? 140 : 150}
            />
        </div>
    )
}
