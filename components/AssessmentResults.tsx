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
    return { letter: "F", color: "#DC2626" }
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
      className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-999 p-6"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border-gray-700 border-2 rounded-xl p-8 max-w-150 w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, textAlign: "center" }}>Performance Assessment</h2>

        <div class="text-center p-6 bg-gray-900 rounded-lg mb-6" >
          <div style={{ color: overallGrade.color }} className="text-7xl font-bold">
            {result.overallScore}%
          </div>
          <div style={{ color: overallGrade.color}} className="text-4xl mt-2">
            Grade: {overallGrade.letter}
          </div>
        </div>

        {/* Timing Analysis */}
        <div
          className="p-4 bg-gray-900 rounded-lg mb-4 border-2"
          style={{ borderColor: timingColor }}
        >
          <div className="text-sm text-gray-500 mb-2">Timing</div>
          <div className="flex items-center gap-3">
            <div className="text-4xl" style={{color: timingColor }}>{timingIcon}</div>
            <div className="flex-1">
              <div className="text-xl font-semibold" style={{ color: timingColor }}>
          {timingLabel}
              </div>
              <div className="text-sm text-gray-300">
          {result.timing.description}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-gray-900 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Pitch Accuracy</div>
            <div className="text-2xl font-semibold">{result.pitchAccuracy}%</div>
          </div>

          <div className="p-4 bg-gray-900 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Rhythm Accuracy</div>
            <div className="text-2xl font-semibold">{result.rhythmAccuracy}%</div>
          </div>

          <div className="p-4 bg-gray-900 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Tone Quality</div>
            <div className="text-2xl font-semibold">{result.toneQuality}%</div>
          </div>

          <div className="p-4 bg-gray-900 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Notes Correct</div>
            <div className="text-2xl font-semibold">
              {result.details.correct}/{result.details.total}
            </div>
          </div>
        </div>

        {/* Excerpt Details */}
        <div className="p-4 bg-gray-900 rounded-lg mb-6">
          <div className="text-sm text-gray-500 mb-2">Excerpt Details</div>
          <div className="text-sm text-gray-300 mb-1">
            Difficulty: {difficultyText}
            {result.difficulty && ` (${scoreMultiplierForDifficulty(result.difficulty)}× multiplier)`}
          </div>
          <div className="text-sm text-gray-300">
            Average HNR: {result.details.avgHNR} dB • Centroid Consistency: {result.details.centroidConsistency}%
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full px-3 py-6 bg-blue-600 hover:bg-blue-700 text-white border-0 rounded-lg text-base font-semibold cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  )
}
