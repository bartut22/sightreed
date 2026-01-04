"use client"

import { RefObject, useEffect, useRef, useState } from "react"
import { startAudio, getAudioContext } from "@/lib/audio"
import { Metronome } from "@/lib/metronome"
import PhraseStaff from "@/components/PhraseStaff"
import CalibrationModal from "@/components/CalibrationModal"
import AssessmentResults from "@/components/AssessmentResults"
import { generatePhrase, type GenerationSettings } from "@/lib/generatePhrase"
import { PerformanceTracker, TickState } from "@/lib/performanceTracker"
import { assessPerformance, type AssessmentResult } from "@/lib/assessment"
import type { Score } from "@/lib/notation"
import ToneQualityGraph from "@/components/ToneQualityGraph"
import Modal from "@/components/Modal"

type AppState = "calibration" | "ready" | "countdown" | "performing" | "results" | "loading" | "stale-calibration"

export default function Home() {
  const [appState, setAppState] = useState<AppState>("loading")
  const [currentBeat, setCurrentBeat] = useState(0)
  const [isBeatOne, setIsBeatOne] = useState(false)
  const [countdownBeats, setCountdownBeats] = useState(0)

  const [pitch, setPitch] = useState<number | null>(null)
  const [rms, setRms] = useState(0)
  const [clarity, setClarity] = useState<number | null>(null)
  const [centroid, setCentroid] = useState(0)
  const [hnr, setHNR] = useState(0)

  const [calibration, setCalibration] = useState<{
    centroid: number
    hnr: number
    minRMS: number
    maxRMS: number,
    latencyMs: number
  } | null>(null)

  const [settings, setSettings] = useState<GenerationSettings>({
    bars: 2,
    difficulty: 2,
    centerMidi: 72,
  })
  const [difficultyChanged, setDifficultyChanged] = useState<boolean>(false);

  const [tempo, setTempo] = useState(120)

  const [generated, setGenerated] = useState<{ score: Score; seed: number } | null>(null)
  const trackerRef = useRef<PerformanceTracker | null>(null)
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [metronome, setMetronome] = useState<Metronome | null>(null)
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [graphStateHistory, setGraphStateHistory] = useState<TickState[]>([])

  const [instrument, setInstrument] = useState<"C" | "Bb" | "Eb" | "F">("Bb")
  const [octaveShift, setOctaveShift] = useState<-1 | 0 | 1>(1)

  const [currentPlayedNote, setCurrentPlayedNote] = useState<{
    pitch: number
    startTime: number
    rms: number
  } | null>(null)

  const noteStartTimeRef = useRef<number | null>(null)

  const transposeSemitones = (() => {
    const instrumentMap = { C: 0, Bb: 2, Eb: 9, F: 7 }
    return instrumentMap[instrument] + octaveShift * 12
  })()

  // Start audio when in loading state
  useEffect(() => {
    if (appState === "ready") handleGenerate(false)
    if (appState !== "loading" && appState !== "stale-calibration") return
    console.log("Starting audio...")

    startAudio(
      setPitch,
      setRms,
      setClarity,
      (c, h) => {
        setCentroid(c)
        setHNR(h)
      }
    ).then(() => {
      // setAppState("ready")
      // Initialize metronome! :)
      if (!appState.includes("calibration")) {
        const ctx = getAudioContext();
        if (ctx) {
          setMetronome(new Metronome(ctx))
          console.log(`Audio started successfully`)
          setAppState("ready")
        }
      }
    }).catch((e) => {
      console.error('Failed to start audio:', e)
    });
  }, [appState])

  // Load calibration from localStorage on mount
  useEffect(() => {
    const savedCalibration = localStorage.getItem('sightread_calibration')
    if (savedCalibration) {
      try {
        const parsed = JSON.parse(savedCalibration)
        const { calibrationTime, ...calibrationData } = parsed

        // ✅ Check if calibration is older than 10 minutes
        const TEN_MINUTES = 10 * 60 * 1000
        const isStale = calibrationTime && (Date.now() - calibrationTime > TEN_MINUTES)

        setCalibration(calibrationData)
        console.log('Loaded saved calibration:', calibrationData, isStale ? '(STALE)' : '(FRESH)')

        if (isStale) {
          setAppState("stale-calibration")
        }
        // If not stale, stay in loading state until metronome initializes
      } catch (e) {
        console.error('Failed to load calibration:', e)
        setAppState("calibration")
      }
    } else {
      setAppState("calibration")
    }
  }, [])

  function getUrlParamsForGeneration(link: string): GenerationSettings | null  {
    const params = new URLSearchParams(link)
    const seed = params.get('seed')
    const bars = params.get('bars')
    const difficulty = params.get('difficulty')
    const tempoParam = params.get('tempo')

    if (seed && bars && difficulty) {
      const urlSettings: GenerationSettings = {
        bars: Number(bars),
        difficulty: Number(difficulty) as 1 | 2 | 3 | 4 | 5,
        centerMidi: 72,
        seed: Number(seed),
        tempo: Number(tempoParam)
      }

      return urlSettings
    }

    return null
  }

  // Load exercise from URL on mount
  useEffect(() => {
    const urlSettings = getUrlParamsForGeneration(window.location.search);
    
    if (urlSettings) {
      // TODO: Show modal when tempo is not passed in URL params
      setSettings(urlSettings);
      handleGenerate(false);
    }
  }, [])

  useEffect(() => {
    // Settings changed
    const urlSettings = getUrlParamsForGeneration(window.location.search);
    if (!urlSettings) return;
    console.log(`Current url: ${window.location.search}`)
    console.log(`Current settings: ${JSON.stringify(settings)}\nSettings from URL: ${JSON.stringify(urlSettings)}`);

    if (settings) {
      // If we change the difficulty, show the "update difficulty button"
      setDifficultyChanged(urlSettings.difficulty != settings.difficulty);
    }
  }, [settings])

  const handleShare = () => {
    if (!generated || !settings) return

    const params = new URLSearchParams({
      seed: generated.seed.toString(),
      bars: (settings?.bars ?? -1).toString(),
      difficulty: (settings.difficulty ?? -1).toString(),
      tempo: tempo.toString(),
    })

    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`

    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied to clipboard!')
    })
  }

  const handleGenerate = (generateSeed: boolean = true) => {
    if (!settings) return;
    const { seed, ...settingsWithoutSeed } = settings
    const gen = generatePhrase(generateSeed ? settingsWithoutSeed : settings)
    setGenerated(gen)
    setAssessment(null)
    
    // Update URL with new seed
    const params = new URLSearchParams({
      seed: gen.seed.toString(),
      bars: (settings.bars ?? -1).toString(),
      difficulty: (settings.difficulty ?? -1).toString(),
      tempo: tempo.toString(),
    })
    window.history.replaceState({}, '', `?${params.toString()}`)
    setDifficultyChanged(false);
  }

  useEffect(() => {
    if (appState === "performing" && trackerRef.current) {
      if (pitch !== null && rms > 0.02) {
        if (noteStartTimeRef.current === null) {
          noteStartTimeRef.current = performance.now()
        }
        setCurrentPlayedNote({
          pitch,
          startTime: noteStartTimeRef.current,
          rms
        })
      } else {
        noteStartTimeRef.current = null
        setCurrentPlayedNote(null)
      }

      trackerRef.current.updateSpectral(centroid, hnr)
      trackerRef.current.update(pitch, rms)
      setCurrentTime(trackerRef.current.getElapsedTime())
    }
  }, [appState, trackerRef.current, pitch, rms, centroid, hnr])

  useEffect(() => {
    if (appState !== "performing" || !trackerRef.current) return

    const interval = setInterval(() => {
      if (trackerRef.current) {
        setGraphStateHistory(trackerRef.current.getStateHistory())
      }
    }, 500)

    return () => clearInterval(interval)
  }, [appState, trackerRef.current])

  const handleCalibrationComplete = (baseline: {
    centroid: number
    hnr: number
    minRMS: number
    maxRMS: number,
    latencyMs: number
  }) => {
    setCalibration(baseline)

    localStorage.setItem('sightread_calibration', JSON.stringify({
      calibrationTime: Date.now(),
      ...baseline
    }))
  }

  const handleStart = () => {
    console.log("Starting performance...", { generated, metronome })
    if (!generated || !metronome) return

    setGraphStateHistory([])

    const beatsPerBar = 4
    const secondsPerBeat = 60 / tempo
    const oneBarDuration = beatsPerBar * secondsPerBeat

    const bars = oneBarDuration > 4 ? 1 : 2
    const beats = bars * beatsPerBar

    setCountdownBeats(beats)
    setCurrentBeat(0)
    setIsBeatOne(false)
    setAppState("countdown")
    setAssessment(null)

    metronome.start(
      tempo,
      beats,
      () => {
        const t = new PerformanceTracker(
          generated.score,
          tempo,
          transposeSemitones,
          calibration?.latencyMs || 0
        )
        t.start()
        trackerRef.current = t
        setCurrentTime(0)
        setAppState("performing")

        const msPerQuarter = 60000 / tempo
        const totalQuarters = generated.score.measures.length * 4
        const totalDuration = totalQuarters * msPerQuarter

        const timer = setTimeout(() => {
          console.log("Finished!")
          handleStop()
        }, totalDuration + 500)

        autoStopTimerRef.current = timer
      },
      (beat, beatOne) => {
        setCurrentBeat(beat)
        setIsBeatOne(beatOne)
      }
    )
  }

  const handleStop = () => {
    if (!settings) return
    console.log(`Stopping performance and assessing... (${trackerRef.current ? 'tracker exists' : 'no tracker'})`)

    if (!trackerRef.current) return

    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current)
      autoStopTimerRef.current = null
    }

    const stateHistory = trackerRef.current.getStateHistory()
    console.log(`State history length: ${stateHistory.length}`)
    console.log('State history sample:', stateHistory.slice(30, 60))

    setGraphStateHistory(stateHistory)

    const result = assessPerformance(
      stateHistory,
      calibration?.centroid || 1000,
      calibration?.hnr || 0.5,
      generated!.score,
      settings.difficulty,
      tempo
    )

    if (result && result.overallScore !== undefined) {
      setAssessment(result)
      setAppState("results")
    } else {
      console.error("Assessment failed", result)
      setAppState("ready")
      trackerRef.current = null
    }
  }

  const handleCloseResults = () => {
    setAppState("ready")
    // setAssessment(null)
    setCurrentTime(0)
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 10%" }}>
      {appState === "loading" && (
        <Modal>
          <>
            <h2 style={{ marginTop: 0 }}>🎵 Loading Calibration Settings...</h2>
            <p style={{ color: "#aaa", lineHeight: 1.6 }}>
              Please wait a moment while we load your saved calibration settings and initialize audio.
            </p>
          </>
        </Modal>
      )}

      {appState === "stale-calibration" && (
        <Modal>
          <>
            <h2 style={{ marginTop: 0 }}>⚠️ Calibration May Be Outdated</h2>
            <p style={{ color: "#aaa", lineHeight: 1.6, marginBottom: 24 }}>
              Your calibration is more than 10 minutes old. For best results, we recommend recalibrating
              if your microphone position, room environment, or instrument setup has changed.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={() => {
                  localStorage.removeItem('sightread_calibration')
                  setCalibration(null)
                  setMetronome(null)
                  setAppState("calibration")
                }}
                style={{
                  background: "#1f6feb",
                  color: "white",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Recalibrate Now
              </button>
              <button
                onClick={() => {
                  // Continue with old calibration - metronome should already be initializing
                  if (metronome) {
                    setAppState("ready")
                  }
                  // Otherwise wait for metronome init useEffect to transition to ready
                }}
                style={{
                  background: "#6b7280",
                  color: "white",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Continue Anyway
              </button>
            </div>
          </>
        </Modal>
      )}

      {appState === "calibration" && (
        <CalibrationModal
          onComplete={handleCalibrationComplete}
          currentRMS={rms}
          currentCentroid={centroid}
          currentHNR={hnr}
        />
      )}

      {assessment && appState === "results" && (
        <AssessmentResults result={assessment} onClose={handleCloseResults} />
      )}

      {appState === "countdown" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 120, fontWeight: 700, color: isBeatOne ? "#22c55e" : "#3b82f6" }}>
              {currentBeat}
            </div>
            <div style={{ fontSize: 24, color: "#aaa", marginTop: 16 }}>
              Count-in: {countdownBeats} beats at {tempo} BPM
            </div>
            <div style={{ fontSize: 14, color: "#666", marginTop: 8 }}>
              Get ready to play...
            </div>
          </div>
        </div>
      )}

      <h1 style={{ marginTop: 0 }}>Sightreading Practice</h1>

      {(appState !== "calibration" && appState !== "loading" && appState !== "stale-calibration") && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "#aaa" }}>Bars</label>
              <select
                value={settings?.bars ?? -1}
                onChange={(e) => setSettings({ ...settings, bars: Number(e.target.value) })}
                disabled={appState === "performing" || appState === "countdown"}
                style={{
                  background: "#1a1a1a",
                  color: "white",
                  border: "1px solid #333",
                  padding: "8px 12px",
                  borderRadius: 6,
                  cursor: appState === "performing" || appState === "countdown" ? "not-allowed" : "pointer",
                }}
              >
                <option value={2}>2 bars</option>
                <option value={4}>4 bars</option>
                <option value={8}>8 bars</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "#aaa" }}>Difficulty</label>
              <select
                value={settings?.difficulty ?? -1}
                onChange={(e) =>
                  setSettings({ ...settings, difficulty: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })
                }
                disabled={appState === "performing" || appState === "countdown"}
                style={{
                  background: "#1a1a1a",
                  color: "white",
                  border: "1px solid #333",
                  padding: "8px 12px",
                  borderRadius: 6,
                  cursor: appState === "performing" || appState === "countdown" ? "not-allowed" : "pointer",
                }}
              >
                <option value={1}>1 - Beginner</option>
                <option value={2}>2 - Easy</option>
                <option value={3}>3 - Medium</option>
                <option value={4}>4 - Hard</option>
                <option value={5}>5 - Expert</option>
              </select>
            </div>

            <button
              onClick={() => handleGenerate()}
              disabled={appState === "performing" || appState === "countdown"}
              style={{
                background: "#1f6feb",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: 8,
                cursor: appState === "performing" || appState === "countdown" ? "not-allowed" : "pointer",
                fontWeight: 600,
                alignSelf: "flex-end",
                opacity: appState === "performing" || appState === "countdown" ? 0.5 : 1,
              }}
            >
              + New Random Exercise
            </button>

            {difficultyChanged && (
              <button
                onClick={() => {
                  console.log(`Update difficulty clicked, now calling handleGenerate() (difficulty ${settings?.difficulty ?? "N/A"})`)
                  handleGenerate(false)
                  setDifficultyChanged(false)
                }}
                disabled={appState === "performing" || appState === "countdown"}
                style={{
                  background: "#1f6feb",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: 8,
                  cursor: appState === "performing" || appState === "countdown" ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  alignSelf: "flex-end",
                  opacity: appState === "performing" || appState === "countdown" ? 0.5 : 1,
                }}
              >
                🏋️‍♀️ Update Difficulty
              </button>
            )}

            {generated && settings && (
              <button
                onClick={handleShare}
                disabled={appState === "performing" || appState === "countdown"}
                style={{
                  background: "#6e56cf",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: 8,
                  cursor: appState === "performing" || appState === "countdown" ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  alignSelf: "flex-end",
                  opacity: appState === "performing" || appState === "countdown" ? 0.5 : 1,
                }}
              >
                📋 Share
              </button>
            )}

            {generated && appState === "ready" && (
              <button
                onClick={handleStart}
                style={{
                  background: "#22c55e",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  alignSelf: "flex-end",
                }}
              >
                ▶ Start Performance
              </button>
            )}

            {appState === "performing" && (
              <button
                onClick={handleStop}
                style={{
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  alignSelf: "flex-end",
                }}
              >
                ⏹ Stop & Assess
              </button>
            )}

            {assessment && appState === "ready" && (
              <button
                onClick={() => setAppState("results")}
                style={{
                  background: "#8b5cf6",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  alignSelf: "flex-end",
                }}
              >
                📊 Show Results
              </button>
            )}


            <button
              onClick={() => {
                localStorage.removeItem('sightread_calibration')
                setCalibration(null)
                setMetronome(null)
                setAppState("calibration")
              }}
              disabled={appState === "performing" || appState === "countdown"}
              style={{
                background: "#6b7280",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: 8,
                cursor: appState === "performing" || appState === "countdown" ? "not-allowed" : "pointer",
                fontWeight: 600,
                alignSelf: "flex-end",
                opacity: appState === "performing" || appState === "countdown" ? 0.5 : 1,
              }}
            >
              🎤 Recalibrate
            </button>
          </div>

          {generated && (
            <>
              <div style={{ marginBottom: 4, fontSize: 13, color: "#888" }}>Expected:</div>
              <PhraseStaff
                score={generated.score}
                title={`${settings?.bars ?? "N/A"}-bar exercise (Difficulty ${settings?.difficulty ?? "N/A"}, ${tempo} BPM)`}
                currentTime={appState === "performing" ? currentTime : 0}
                tempo={tempo}
                noteResults={assessment?.noteResults}
              />
            </>
          )}
        </>
      )}
    </main>
  )
}
