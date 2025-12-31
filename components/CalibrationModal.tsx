"use client"

import { useEffect, useState, useRef } from "react"
import { getAudioContext } from "@/lib/audio"
import { Metronome } from "@/lib/metronome"

type Props = {
  onComplete: (baseline: {
    centroid: number
    hnr: number
    minRMS: number
    maxRMS: number
    latencyMs: number
  }) => void
  currentRMS: number
  currentCentroid: number
  currentHNR: number
}

type CalibrationStep = "intro" | "volume-soft" | "volume-loud" | "latency-intro" | "latency-test" | "complete"

export default function CalibrationModal({
  onComplete,
  currentRMS,
  currentCentroid,
  currentHNR,
}: Props) {
  const [step, setStep] = useState<CalibrationStep>("intro")
  const [progress, setProgress] = useState(0)

  // Volume calibration - separate for soft and loud
  const [softSamples, setSoftSamples] = useState<number[]>([])
  const [loudSamples, setLoudSamples] = useState<number[]>([])
  const [avgCentroid, setAvgCentroid] = useState(0)
  const [avgHNR, setAvgHNR] = useState(0)
  const centroidSamples = useRef<number[]>([])
  const hnrSamples = useRef<number[]>([])

  const [volumeFeedback, setVolumeFeedback] = useState<{
    message: string
    color: string
  } | null>(null)

  // Latency calibration - USE REFS instead of state for tap tracking
  const [currentBeat, setCurrentBeat] = useState(0)
  const [isMetronomePlaying, setIsMetronomePlaying] = useState(false)
  const tapTimesRef = useRef<number[]>([]) // ✅ Use ref instead of state
  const [tapCount, setTapCount] = useState(0) // For display only
  const metronomeClickTimesRef = useRef<number[]>([]) // ✅ Use ref
  const [detectedLatency, setDetectedLatency] = useState<number | null>(null)
  const metronomeRef = useRef<Metronome | null>(null)

  const TAPS_NEEDED = 8

  // Target ranges for good calibration
  const SOFT_TARGET_MIN = 0.015
  const SOFT_TARGET_MAX = 0.04
  const LOUD_TARGET_MIN = 0.06
  const LOUD_TARGET_MAX = 0.15

  // Soft volume calibration
  useEffect(() => {
    if (step !== "volume-soft") return

    if (currentRMS > 0.005) {
      // Provide real-time feedback
      if (currentRMS < SOFT_TARGET_MIN) {
        setVolumeFeedback({
          message: "🔇 Too quiet - play a bit louder",
          color: "#f59e0b"
        })
      } else if (currentRMS > SOFT_TARGET_MAX) {
        setVolumeFeedback({
          message: "🔊 Too loud for piano - play softer",
          color: "#ef4444"
        })
      } else {
        setVolumeFeedback({
          message: "✅ Perfect! Hold this volume...",
          color: "#22c55e"
        })

        // ✅ Only add sample if we don't already have enough
        if (softSamples.length < 30) {
          setSoftSamples(prev => [...prev, currentRMS])
          centroidSamples.current.push(currentCentroid)
          hnrSamples.current.push(currentHNR)
        }
      }

      const newProgress = Math.min((softSamples.length / 30) * 100, 100)
      setProgress(newProgress)

      if (softSamples.length >= 30) {
        setTimeout(() => {
          setProgress(0)
          setStep("volume-loud")
        }, 500)
      }
    }
  }, [step, currentRMS, currentCentroid, currentHNR, softSamples.length]) // ✅ Only depend on length, not array

  // Loud volume calibration
  useEffect(() => {
    if (step !== "volume-loud") return

    if (currentRMS > 0.01) {
      // Provide real-time feedback
      if (currentRMS < LOUD_TARGET_MIN) {
        setVolumeFeedback({
          message: "📢 Too quiet for forte - play MUCH louder",
          color: "#f59e0b"
        })
      } else if (currentRMS > LOUD_TARGET_MAX) {
        setVolumeFeedback({
          message: "⚠️ TOO LOUD! Move mic away or reduce volume",
          color: "#991b1b"
        })
      } else {
        setVolumeFeedback({
          message: "✅ Perfect forte! Hold this volume...",
          color: "#22c55e"
        })

        // ✅ Only add sample if we don't already have enough
        if (loudSamples.length < 30) {
          setLoudSamples(prev => [...prev, currentRMS])
          centroidSamples.current.push(currentCentroid)
          hnrSamples.current.push(currentHNR)
        }
      }

      const newProgress = Math.min((loudSamples.length / 30) * 100, 100)
      setProgress(newProgress)

      if (loudSamples.length >= 30) {
        // Calculate averages
        const avgCent = centroidSamples.current.reduce((a, b) => a + b, 0) / centroidSamples.current.length
        const avgH = hnrSamples.current.reduce((a, b) => a + b, 0) / hnrSamples.current.length
        setAvgCentroid(avgCent)
        setAvgHNR(avgH)

        setTimeout(() => setStep("latency-intro"), 500)
      }
    }
  }, [step, currentRMS, currentCentroid, currentHNR, loudSamples.length]) // ✅ Only depend on length, not array


  // Start latency test
  const startLatencyTest = () => {
    const ctx = getAudioContext()
    if (!ctx) return

    setStep("latency-test")
    setIsMetronomePlaying(true)
    tapTimesRef.current = [] // ✅ Reset ref
    metronomeClickTimesRef.current = [] // ✅ Reset ref

    const metronome = new Metronome(ctx)
    metronomeRef.current = metronome

    const tempo = 120
    const beats = 16
    const clickTimes: number[] = []

    metronome.start(
      tempo,
      beats,
      () => {
        setIsMetronomePlaying(false)
        calculateLatency()
      },
      (beat, isBeatOne) => {
        setCurrentBeat(beat)
        const clickTime = performance.now()
        metronomeClickTimesRef.current.push(clickTime)
      }
    )
  }

  // Handle tap on beat
  const handleTap = () => {
    if (!isMetronomePlaying) return
    const tapTime = performance.now()
    tapTimesRef.current.push(tapTime)
    setTapCount(tapTimesRef.current.length) // Update display
    console.log(`Tap ${tapTimesRef.current.length} at ${tapTime}`)
    if (tapTimesRef.current.length >= TAPS_NEEDED && metronomeRef.current !== null) {
      console.log("Taps are done!")
      setIsMetronomePlaying(false);
      metronomeRef.current.stop(calculateLatency)
      return
    }
  }

  useEffect(() => {
    if (step !== "latency-test") return

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault()
        handleTap()
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [step, isMetronomePlaying])

  // Calculate latency from tap data
  const calculateLatency = () => {
    const clickTimes = metronomeClickTimesRef.current
    const taps = tapTimesRef.current

    // console.log(`Calculating latency: ${taps.length} taps, ${clickTimes.length} clicks`)

    if (taps.length < 3) {
      // console.log('⚠️ Not enough taps, using 0ms latency')
      setDetectedLatency(0)
      setStep("complete")
      return
    }

    const offsets: number[] = []

    for (const tap of taps) {
      let closestClickTime = clickTimes[0]
      let minDiff = Math.abs(tap - clickTimes[0])

      for (const click of clickTimes) {
        const diff = Math.abs(tap - click)
        if (diff < minDiff) {
          minDiff = diff
          closestClickTime = click
        }
      }

      // Offset = tap time - click time (positive = you tapped late)
      const offset = tap - closestClickTime
      offsets.push(offset)
      // console.log(`Tap at ${tap}, closest click at ${closestClickTime}, offset: ${offset}ms`)
    }

    // Average offset (exclude outliers)
    const sorted = offsets.sort((a, b) => a - b)
    const trimmed = sorted.slice(1, -1) // Remove min and max
    const avgOffset = trimmed.length > 0
      ? trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length
      : offsets.reduce((sum, v) => sum + v, 0) / offsets.length // Use all if too few

    // console.log(`Offsets: ${offsets.join(', ')}`)
    // console.log(`Average latency: ${Math.round(avgOffset)}ms`)

    setDetectedLatency(Math.round(avgOffset))
    setStep("complete")
  }

  const handleComplete = () => {
    // Calculate final min/max from samples
    const minRMS = softSamples.length > 0
      ? softSamples.reduce((a, b) => a + b, 0) / softSamples.length
      : 0.02

    const maxRMS = loudSamples.length > 0
      ? loudSamples.reduce((a, b) => a + b, 0) / loudSamples.length
      : 0.1

    onComplete({
      centroid: avgCentroid,
      hnr: avgHNR,
      minRMS,
      maxRMS,
      latencyMs: detectedLatency || 0,
    })
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#1a1a1a",
          padding: 32,
          borderRadius: 12,
          maxWidth: 500,
          width: "90%",
        }}
      >
        {step === "intro" && (
          <>
            <h2 style={{ marginTop: 0 }}>🎵 Microphone Calibration</h2>
            <p style={{ color: "#aaa", lineHeight: 1.6 }}>
              We'll calibrate your setup in three steps:
            </p>
            <ol style={{ color: "#aaa", lineHeight: 1.8 }}>
              <li><strong>Piano (soft)</strong> - Play softly to set minimum volume</li>
              <li><strong>Forte (loud)</strong> - Play loudly to set maximum volume</li>
              <li><strong>Latency</strong> - Tap along with a metronome to measure delay</li>
            </ol>
            <p style={{ color: "#888", fontSize: 14 }}>This takes about 30 seconds total.</p>
            <button
              onClick={() => setStep("volume-soft")}
              style={{
                background: "#22c55e",
                color: "white",
                border: "none",
                padding: "12px 24px",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
                marginTop: 16,
              }}
            >
              Start Calibration
            </button>
          </>
        )}

        {step === "volume-soft" && (
          <>
            <h2 style={{ marginTop: 0 }}>Step 1: Piano (Soft)</h2>
            <p style={{ color: "#aaa", lineHeight: 1.6, marginBottom: 24 }}>
              Play a comfortable middle note at your <strong>softest sustainable volume</strong> (pianissimo).
            </p>

            {volumeFeedback && (
              <div
                style={{
                  background: volumeFeedback.color === "#22c55e" ? "#065f46" :
                    volumeFeedback.color === "#ef4444" ? "#991b1b" : "#92400e",
                  color: "white",
                  padding: 16,
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: 16,
                  fontWeight: 600,
                  textAlign: "center",
                  border: `2px solid ${volumeFeedback.color}`,
                }}
              >
                {volumeFeedback.message}
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>
                Progress: {Math.round(progress)}% ({softSamples.length}/30 samples)
              </div>
              <div
                style={{
                  width: "100%",
                  height: 12,
                  background: "#333",
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "#22c55e",
                    transition: "width 0.2s",
                  }}
                />
              </div>
            </div>

            <div style={{ padding: 16, background: "#0a0a0a", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: "#888" }}>Current RMS</div>
              <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4 }}>
                {currentRMS.toFixed(3)}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                Target: {SOFT_TARGET_MIN.toFixed(3)} - {SOFT_TARGET_MAX.toFixed(3)}
              </div>
            </div>
          </>
        )}

        {step === "volume-loud" && (
          <>
            <h2 style={{ marginTop: 0 }}>Step 2: Forte (Loud)</h2>
            <p style={{ color: "#aaa", lineHeight: 1.6, marginBottom: 24 }}>
              Play the same note at your <strong>loudest comfortable volume</strong> (fortissimo).
            </p>

            {volumeFeedback && (
              <div
                style={{
                  background: volumeFeedback.color === "#22c55e" ? "#065f46" :
                    volumeFeedback.color === "#991b1b" ? "#7f1d1d" : "#92400e",
                  color: "white",
                  padding: 16,
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: 16,
                  fontWeight: 600,
                  textAlign: "center",
                  border: `2px solid ${volumeFeedback.color}`,
                }}
              >
                {volumeFeedback.message}
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>
                Progress: {Math.round(progress)}% ({loudSamples.length}/30 samples)
              </div>
              <div
                style={{
                  width: "100%",
                  height: 12,
                  background: "#333",
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "#3b82f6",
                    transition: "width 0.2s",
                  }}
                />
              </div>
            </div>

            <div style={{ padding: 16, background: "#0a0a0a", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: "#888" }}>Current RMS</div>
              <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4 }}>
                {currentRMS.toFixed(3)}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                Target: {LOUD_TARGET_MIN.toFixed(3)} - {LOUD_TARGET_MAX.toFixed(3)}
              </div>
            </div>
          </>
        )}

        {step === "latency-intro" && (
          <>
            <h2 style={{ marginTop: 0 }}>Step 3: Latency Calibration</h2>
            <p style={{ color: "#aaa", lineHeight: 1.6 }}>
              Now we'll measure audio latency. You'll hear a metronome - tap the <strong>spacebar</strong> or
              click the button below <strong>on each beat</strong>.
            </p>
            <p style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>
              Try to tap exactly with the metronome click. We'll measure the timing difference.
            </p>
            <button
              onClick={startLatencyTest}
              style={{
                background: "#3b82f6",
                color: "white",
                border: "none",
                padding: "12px 24px",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Start Latency Test ({TAPS_NEEDED} beats)
            </button>
          </>
        )}

        {step === "latency-test" && (
          <>
            <h2 style={{ marginTop: 0 }}>Tap on Each Beat!</h2>
            <div
              style={{
                fontSize: 80,
                fontWeight: 700,
                textAlign: "center",
                color: "#3b82f6",
                marginBottom: 24,
              }}
            >
              {currentBeat}
            </div>
            <button
              onClick={handleTap}
              style={{
                background: "#22c55e",
                color: "white",
                border: "none",
                padding: "24px 48px",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 18,
                width: "100%",
              }}
            >
              TAP HERE (or press spacebar)
            </button>
            <div style={{ textAlign: "center", marginTop: 16, color: "#888", fontSize: 14 }}>
              Taps: {tapCount} / {TAPS_NEEDED}  {/* ✅ Use tapCount state for display */}
            </div>
          </>
        )}

        {step === "complete" && (
          <>
            <h2 style={{ marginTop: 0 }}>✅ Calibration Complete!</h2>
            <div style={{ marginBottom: 24 }}>
              <div style={{ padding: 16, background: "#0a0a0a", borderRadius: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#888" }}>Dynamic Range</div>
                <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>
                  Piano: {(softSamples.reduce((a, b) => a + b, 0) / softSamples.length).toFixed(3)} •
                  Forte: {(loudSamples.reduce((a, b) => a + b, 0) / loudSamples.length).toFixed(3)}
                </div>
                <div style={{ fontSize: 12, color: "#22c55e", marginTop: 8 }}>
                  ✓ {softSamples.length} soft samples, {loudSamples.length} loud samples collected
                </div>
              </div>
              <div style={{ padding: 16, background: "#0a0a0a", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "#888" }}>Detected Latency</div>
                <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>
                  {detectedLatency !== null ? `${detectedLatency}ms` : "Not measured"}
                </div>
                {detectedLatency !== null && detectedLatency > 50 && (
                  <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 8 }}>
                    ⚡ High latency detected - this will be compensated automatically
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleComplete}
              style={{
                background: "#22c55e",
                color: "white",
                border: "none",
                padding: "12px 24px",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
                width: "100%",
              }}
            >
              Continue to Practice
            </button>
          </>
        )}
      </div>
    </div>
  )
}
