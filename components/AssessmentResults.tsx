"use client"

import { scoreMultiplierForDifficulty, type AssessmentResult } from "@/lib/assessment"

type Props = {
  result: AssessmentResult
  onClose: () => void
}

export default function AssessmentResults({ result, onClose }: Props) {
  function getGrade(score: number) {
    if (score >= 97) return { letter: "S", color: "#a855f7" }
    if (score >= 93) return { letter: "A+", color: "#22c55e" }
    if (score >= 90) return { letter: "A", color: "#22c55e" }
    if (score >= 85) return { letter: "B+", color: "#3b82f6" }
    if (score >= 80) return { letter: "B", color: "#3b82f6" }
    if (score >= 75) return { letter: "C+", color: "#f59e0b" }
    if (score >= 70) return { letter: "C", color: "#f59e0b" }
    if (score >= 65) return { letter: "D+", color: "#ef4444" }
    if (score >= 60) return { letter: "D", color: "#ef4444" }
    return { letter: "F", color: "#991b1b" }
  }

  function getTimingColor(tendency: string, description: string) {
    // If inconsistent, show orange/yellow
    if (description.includes("Inconsistent")) return "#f59e0b"
    if (tendency === "on-time") return "#22c55e"
    if (tendency === "rushing") return "#f59e0b"
    return "#3b82f6" // dragging
  }

  function getTimingIcon(tendency: string, description: string) {
    // If inconsistent, show warning
    if (description.includes("Inconsistent")) return "⚠️"
    if (tendency === "on-time") return "✓"
    if (tendency === "rushing") return "⚡"
    return "🐌" // dragging
  }

  function getTimingLabel(tendency: string, description: string) {
    if (description.includes("Inconsistent")) return "Inconsistent"
    if (tendency === "on-time") return "On Time"
    if (tendency === "rushing") return "Rushing"
    return "Dragging"
  }

  const overallGrade = getGrade(result.overallScore)
  const timingColor = getTimingColor(result.timing.tendency, result.timing.description)
  const timingIcon = getTimingIcon(result.timing.tendency, result.timing.description)
  const timingLabel = getTimingLabel(result.timing.tendency, result.timing.description)

  const difficultyText = result.difficulty
    ? result.difficulty === 1 ? "Beginner"
      : result.difficulty === 2 ? "Easy"
      : result.difficulty === 3 ? "Intermediate"
      : result.difficulty === 4 ? "Hard"
      : "Expert"
    : "N/A"

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1a1a1a",
          border: "2px solid #333",
          borderRadius: 12,
          padding: 32,
          maxWidth: 600,
          width: "100%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, textAlign: "center" }}>Performance Assessment</h2>

        <div
          style={{
            textAlign: "center",
            padding: 24,
            background: "#0a0a0a",
            borderRadius: 8,
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 72, fontWeight: 700, color: overallGrade.color }}>
            {result.overallScore}%
          </div>
          <div style={{ fontSize: 32, color: overallGrade.color, marginTop: 8 }}>
            Grade: {overallGrade.letter}
          </div>
        </div>

        {/* Timing Analysis */}
        <div
          style={{
            padding: 16,
            background: "#0a0a0a",
            borderRadius: 8,
            marginBottom: 16,
            border: `2px solid ${timingColor}`,
          }}
        >
          <div style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>Timing</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 32 }}>{timingIcon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: timingColor }}>
                {timingLabel}
              </div>
              <div style={{ fontSize: 13, color: "#ccc" }}>
                {result.timing.description}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <div style={{ padding: 16, background: "#0a0a0a", borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Pitch Accuracy</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{result.pitchAccuracy}%</div>
          </div>

          <div style={{ padding: 16, background: "#0a0a0a", borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Rhythm Accuracy</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{result.rhythmAccuracy}%</div>
          </div>

          <div style={{ padding: 16, background: "#0a0a0a", borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Tone Quality</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{result.toneQuality}%</div>
          </div>

          <div style={{ padding: 16, background: "#0a0a0a", borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Notes Correct</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>
              {result.details.correct}/{result.details.total}
            </div>
          </div>
        </div>

        {/* Excerpt Details */}
        <div style={{ padding: 16, background: "#0a0a0a", borderRadius: 8, marginBottom: 24 }}>
          <div style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>Excerpt Details</div>
          <div style={{ fontSize: 13, color: "#ccc", marginBottom: 4 }}>
            Difficulty: {difficultyText}
            {result.difficulty && ` (${scoreMultiplierForDifficulty(result.difficulty)}× multiplier)`}
          </div>
          <div style={{ fontSize: 13, color: "#ccc" }}>
            Average HNR: {result.details.avgHNR} dB • Centroid Consistency: {result.details.centroidConsistency}%
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "12px 24px",
            background: "#1f6feb",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
