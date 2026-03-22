"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startAudio,
  getAudioContext,
  getAudioStream,
  stopAudio,
} from "@/lib/audio";
import { Metronome } from "@/lib/metronome";
import AbcStaff from "@/components/AbcStaff";
import AssessmentResults from "@/components/AssessmentResults";
import { generatePhrase, type GenerationSettings } from "@/lib/generatePhrase";
import {
  PerformanceTracker,
  TickState,
  buildPlayedBlocksFromStateHistory,
  type PlayedNoteBlock,
} from "@/lib/performanceTracker";
import { assessPerformance, type AssessmentResult } from "@/lib/assessment";
import type { Score } from "@/lib/notation";
import Modal from "@/components/Modal";
import ScoreRollView from "@/components/ScoreRollView";
import { detectClickTimes, remapStateHistory } from "@/lib/beatDetector";
import { analyzeRecording } from "@/lib/analyzeRecording";

type AppState =
  | "ready"
  | "countdown"
  | "performing"
  | "processing"
  | "results"
  | "loading";

type Instrument = {
  name: string;
  transposeSemitones: number;
};

const INSTRUMENTS: Record<string, Instrument> = {
  flute: { name: "Flute", transposeSemitones: 0 },

  bbClarinet: { name: "Bb Clarinet", transposeSemitones: -2 },
  bbSoprano: { name: "Bb Soprano Sax", transposeSemitones: -2 },
  bbTenor: { name: "Bb Tenor Sax", transposeSemitones: -14 },

  ebClarinet: { name: "Eb Clarinet", transposeSemitones: 3 },
  ebAlto: { name: "Eb Alto Sax", transposeSemitones: -9 },
  ebBaritone: { name: "Eb Baritone Sax", transposeSemitones: -21 },

  fHorn: { name: "F Horn", transposeSemitones: -7 },

  trumpet: { name: "Trumpet", transposeSemitones: -2 },
};

export default function Home() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [currentBeat, setCurrentBeat] = useState(0);
  const [isBeatOne, setIsBeatOne] = useState(false);
  const [countdownBeats, setCountdownBeats] = useState(0);

  const [settings, setSettings] = useState<GenerationSettings>({
    bars: 2,
    difficulty: 2,
    centerMidi: 72,
  });
  const [difficultyChanged, setDifficultyChanged] = useState<boolean>(false);

  const [tempo, setTempo] = useState(120);

  const [generated, setGenerated] = useState<{
    score: Score;
    seed: number;
  } | null>(null);
  const pendingAssessmentRef = useRef<{
    score: Score;
    difficulty: 1 | 2 | 3 | 4 | 5;
  } | null>(null);
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [listeningMode, setListeningMode] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  // const [recordingMeta, setRecordingMeta] = useState<{ tempo: number; totalBeats: number; metStartMs: number } | null>(null)
  const [currentTime, setCurrentTime] = useState(0);
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [graphStateHistory, setGraphStateHistory] = useState<TickState[]>([]);
  const [playedNoteBlocks, setPlayedNoteBlocks] = useState<PlayedNoteBlock[]>(
    [],
  );
  const [playbackOffsetSec, setPlaybackOffsetSec] = useState(0);

  const [instrument, setInstrument] = useState<string>("bbClarinet");

  // const listeningSourceRef = useRef<AudioBufferSourceNode | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const metronomeRef = useRef<Metronome | null>(null);

  const hasGeneratedOnMount = useRef(false);
  // const listeningMetRef = useRef<Metronome | null>(null)

  const transposeSemitones = INSTRUMENTS[instrument]?.transposeSemitones ?? 0;

  const controlsDisabled =
    appState === "performing" || appState === "countdown";

  const standardInputStyle = {
    background: "#1a1a1a",
    color: "white",
    border: "1px solid #333",
    padding: "8px 12px",
    borderRadius: 6,
    cursor: controlsDisabled ? "not-allowed" : "pointer",
  };

  const midiToNoteName = (midi: number): string => {
    const noteNames = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    const octave = Math.floor(midi / 12) - 1;
    const noteName = noteNames[midi % 12];
    return `${noteName}${octave}`;
  };

  const getTonicDisplay = (): string => {
    const writtenMidi = settings?.centerMidi ?? 72;
    const writtenNote = midiToNoteName(writtenMidi);

    if (transposeSemitones === 0) {
      return writtenNote;
    }

    const concertMidi = writtenMidi + transposeSemitones;
    const concertNote = midiToNoteName(concertMidi);
    return `${writtenNote} (${concertNote})`;
  };

  const playTonic = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const tonicMidi = (settings?.centerMidi ?? 72) + transposeSemitones;
    const freq = 440 * Math.pow(2, (tonicMidi - 69) / 12);

    const fund = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const ring = ctx.createOscillator();
    const gain = ctx.createGain();
    const overtoneGain = ctx.createGain();
    const ringGain = ctx.createGain();

    fund.type = "sine";
    overtone.type = "sine";
    ring.type = "sine";
    fund.frequency.value = freq;
    overtone.frequency.value = freq * 2;
    ring.frequency.value = freq * 4;

    const noteLength = 5;

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + noteLength - 0.1,
    );

    overtoneGain.gain.setValueAtTime(0.2, ctx.currentTime);

    ringGain.gain.setValueAtTime(0.15, ctx.currentTime);

    fund.connect(gain);
    overtone.connect(overtoneGain);
    overtoneGain.connect(gain);
    ring.connect(ringGain);
    ringGain.connect(gain);
    gain.connect(ctx.destination);

    fund.start();
    overtone.start();
    ring.start();
    fund.stop(ctx.currentTime + noteLength);
    overtone.stop(ctx.currentTime + noteLength);
    ring.stop(ctx.currentTime + noteLength);
  };

  // Start/stop microphone based on app state
  useEffect(() => {
    const needsMic =
      appState === "loading" ||
      appState === "countdown" ||
      appState === "performing";

    const hasStream = !!getAudioStream();

    // Turn mic on when entering a state that needs it
    if (needsMic && !hasStream) {
      console.log("Starting audio...");
      startAudio()
        .then(() => {
          const ctx = getAudioContext();
          if (ctx && !metronomeRef.current) {
            metronomeRef.current = new Metronome(ctx);
          }
          // Only auto-advance from loading → ready
          if (appState === "loading") {
            console.log(`Audio started successfully`);
            setAppState("ready");
          }
        })
        .catch((e) => {
          console.error("Failed to start audio:", e);
        });
      return;
    }

    // Turn mic off when leaving states that need it
    if (!needsMic && hasStream) {
      console.log("Stopping microphone capture...");
      stopAudio();
    }
  }, [appState]);

  // Reinitialize metronome when tempo changes
  useEffect(() => {
    if (appState !== "ready") return;

    const ctx = getAudioContext();
    if (ctx) {
      metronomeRef.current?.stop();
      metronomeRef.current = new Metronome(ctx);
    }
  }, [appState, tempo]);

  function getUrlParamsForGeneration(link: string): GenerationSettings | null {
    const params = new URLSearchParams(link);
    const seed = params.get("seed");
    const bars = params.get("bars");
    const difficulty = params.get("difficulty");
    const tempoParam = params.get("tempo");

    if (seed && bars && difficulty) {
      const urlSettings: GenerationSettings = {
        bars: Number(bars),
        difficulty: Number(difficulty) as 1 | 2 | 3 | 4 | 5,
        centerMidi: 72,
        seed: Number(seed),
      };
      // only copy tempo if it was supplied
      if (tempoParam !== null) {
        urlSettings.tempo = Number(tempoParam);
      }
      return urlSettings;
    }

    return null;
  }

  const handleGenerate = useCallback(
    (generateSeed: boolean = true) => {
      if (!settings) return;
      const { seed, ...settingsWithoutSeed } = settings;
      const gen = generatePhrase(generateSeed ? settingsWithoutSeed : settings);
      setGenerated(gen);
      setAssessment(null);
      setGraphStateHistory([]);
      setPlayedNoteBlocks([]);
      setListeningMode(false);
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
        setRecordingUrl(null);
      }
      // setRecordingMeta(null)

      // Update URL with new seed
      const params = new URLSearchParams({
        seed: gen.seed.toString(),
        bars: (settings.bars ?? -1).toString(),
        difficulty: (settings.difficulty ?? -1).toString(),
        tempo: tempo.toString(),
      });
      window.history.replaceState({}, "", `?${params.toString()}`);
      setDifficultyChanged(false);
      setPlaybackOffsetSec(0);
    },
    [settings, tempo, recordingUrl],
  );

  // // Load exercise from URL on mount
  // useEffect(() => {
  //   const urlSettings = getUrlParamsForGeneration(window.location.search);
  //   console.log(`URL settings: ${JSON.stringify(urlSettings)}`)

  //   if (urlSettings) {
  //     if (urlSettings.tempo !== undefined && !isNaN(urlSettings.tempo)) {
  //       setTempo(urlSettings.tempo)
  //     } else {
  //       // TODO from original: let user know tempo needs to be set manually
  //       alert('Link did not specify a tempo – please choose one before you start.')
  //     }

  //     setSettings(urlSettings);
  //   } else {
  //     console.log("No URL settings found")
  //     handleGenerate(true);

  //   }
  // }, [])

  // useEffect(() => {
  //   if (!shouldGenerateFromUrl) return;
  //   if (!settings?.seed) return;

  //   handleGenerate(false);
  // }, [shouldGenerateFromUrl])

  useEffect(() => {
    if (hasGeneratedOnMount.current) return;
    hasGeneratedOnMount.current = true;

    const urlSettings = getUrlParamsForGeneration(window.location.search);
    console.log(`URL settings: ${JSON.stringify(urlSettings)}`);

    if (urlSettings) {
      if (urlSettings.tempo !== undefined && !isNaN(urlSettings.tempo)) {
        setTempo(urlSettings.tempo);
      } else {
        alert(
          "Link did not specify a tempo – please choose one before you start.",
        );
      }
      setSettings(urlSettings);
      handleGenerate(false); // pass settings directly ↓
    } else {
      console.log("No URL settings found");
      handleGenerate(true);
    }
  }, [handleGenerate]);

  useEffect(() => {
    // Settings changed
    const urlSettings = getUrlParamsForGeneration(window.location.search);
    if (!urlSettings) return;
    // console.log(`Current url: ${window.location.search}`)
    // console.log(`Current settings: ${JSON.stringify(settings)}\nSettings from URL: ${JSON.stringify(urlSettings)}`);

    if (settings) {
      // If we change the difficulty, show the "update difficulty button"
      setDifficultyChanged(urlSettings.difficulty != settings.difficulty);
    }
  }, [settings]);

  const handleShare = () => {
    if (!generated || !settings) return;

    console.log(`Generated: ${JSON.stringify(generated)}`);
    console.log(`Settings: ${JSON.stringify(settings)}`);
    console.log(`Tempo: ${tempo}`);

    const params = new URLSearchParams({
      seed: generated.seed.toString(),
      bars: (settings?.bars ?? -1).toString(),
      difficulty: (settings.difficulty ?? -1).toString(),
      tempo: tempo.toString(),
    });

    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

    console.log(`URL: ${url}`);
    navigator.clipboard
      .write([
        new ClipboardItem({
          "text/plain": new Blob([url], { type: "text/plain" }),
        }),
      ])
      .then(() => {
        alert("Link copied to clipboard!");
      });
  };

  const handleStart = () => {
    console.log("Starting performance...", {
      generated,
      metronome: metronomeRef.current,
    });
    if (!generated || !metronomeRef.current) return;

    setGraphStateHistory([]);
    setPlayedNoteBlocks([]);
    setListeningMode(false);
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      setRecordingUrl(null);
    }
    // setRecordingMeta(null)

    const beatsPerBar = 4;
    const secondsPerBeat = 60 / tempo;
    const oneBarDuration = beatsPerBar * secondsPerBeat;

    const bars = oneBarDuration > 4 ? 1 : 2;
    const beats = bars * beatsPerBar;

    setCountdownBeats(beats);
    setCurrentBeat(0);
    setIsBeatOne(false);
    setAppState("countdown");
    setAssessment(null);

    metronomeRef.current?.start(
      tempo,
      beats,
      () => {
        console.log("🎯 Performance starting:", {
          instrument,
          transposeSemitones,
          centerMidi: settings?.centerMidi ?? 72,
          score: generated.score,
        });

        const t = new PerformanceTracker(
          generated.score,
          tempo,
          transposeSemitones,
        );
        t.start();
        setCurrentTime(0);
        setAppState("performing");

        metronomeRef.current?.startContinuous(tempo, (beat, isBeatOne) => {
          setCurrentBeat(beat);
          setIsBeatOne(isBeatOne);
        });

        const msPerQuarter = 60000 / tempo;
        const totalQuarters = generated.score.measures.length * 4;
        // setRecordingMeta({
        //   tempo,
        //   totalBeats: totalQuarters,
        //   metStartMs: performance.now()
        // })

        const stream = getAudioStream();
        if (stream && typeof MediaRecorder !== "undefined") {
          const chunks: BlobPart[] = [];
          try {
            const recorder = new MediaRecorder(stream);
            recorderRef.current = recorder;
            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) chunks.push(e.data);
            };
            recorder.onstop = async () => {
              const blob = new Blob(chunks, {
                type: recorder.mimeType || "audio/webm",
              });
              const url = URL.createObjectURL(blob);
              setRecordingUrl(url); // always set this regardless of what happens next

              const pending = pendingAssessmentRef.current;
              if (!pending) return;

              setAppState("processing");

              try {
                const stateHistory = await analyzeRecording(
                  blob,
                  pending.score,
                  tempo,
                  transposeSemitones,
                );
                const clickTimes = await detectClickTimes(blob, tempo);

                // Use first detected click as playback alignment anchor
                const firstClickSec = clickTimes.length > 0 ? clickTimes[0] : 0;

                setPlaybackOffsetSec(Math.max(0, firstClickSec / 1000));

                const expectedClicks = pending.score.measures.length * 4;
                if (clickTimes.length < expectedClicks * 0.5) {
                  console.warn(
                    `Beat detection unreliable: got ${clickTimes.length}/${expectedClicks} clicks`,
                  );
                  // Don't throw — just skip remapping and use raw stateHistory
                }

                const msPerTick = 60000 / tempo / 48;
                const remapped =
                  clickTimes.length >= expectedClicks * 0.5
                    ? remapStateHistory(stateHistory, clickTimes, msPerTick)
                    : stateHistory; // raw, unremapped

                setGraphStateHistory(remapped);
                setPlayedNoteBlocks(
                  buildPlayedBlocksFromStateHistory(remapped),
                );

                const result = assessPerformance(
                  remapped,
                  pending.score,
                  pending.difficulty,
                  tempo,
                );
                if (result?.overallScore !== undefined) {
                  setAssessment(result);
                  setShowResultsModal(true);
                }
              } catch (e) {
                console.error("Post-hoc assessment error", e);
                // assessment is null, but recordingUrl is set — listen button will still appear
              } finally {
                setAppState("ready");
                pendingAssessmentRef.current = null;
              }
            };

            recorder.start();
          } catch (e) {
            console.error("Failed to start recording:", e);
          }
        }

        const totalDuration = totalQuarters * msPerQuarter;

        const timer = setTimeout(() => {
          console.log("Finished!");
          handleStop();
        }, totalDuration + 500);

        autoStopTimerRef.current = timer;
      },
      (beat, beatOne) => {
        setCurrentBeat(beat);
        setIsBeatOne(beatOne);
      },
    );
  };
  const handleStop = () => {
    if (!settings) return;

    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    if (!settings.difficulty) {
      console.error("No difficulty setting found, cannot assess performance.");
      setAppState("ready");
      // if (listeningMetRef.current) listeningMetRef.current.stop()
      return;
    }
    pendingAssessmentRef.current = {
      score: generated!.score,
      difficulty: settings.difficulty,
    };

    // if (listeningMetRef.current) listeningMetRef.current.stop()
    metronomeRef.current?.stop();

    // recorder.onstop will fire async and do the rest
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const handleCloseResults = () => {
    setShowResultsModal(false);
  };

  const toggleListening = async () => {
    const a = audioRef.current;
    if (!recordingUrl || !a) return;

    if (!a.paused) {
      a.pause();
      setListeningMode(false);
      return;
    }

    // Ensure metadata is loaded so duration is known
    if (a.readyState < 1) {
      await new Promise<void>((resolve) => {
        const onLoaded = () => {
          a.removeEventListener("loadedmetadata", onLoaded);
          resolve();
        };
        a.addEventListener("loadedmetadata", onLoaded);
        a.load();
      });
    }

    const duration = Number.isFinite(a.duration) ? a.duration : 0;
    const safeStart =
      duration > 0
        ? Math.min(Math.max(0, playbackOffsetSec), Math.max(0, duration - 0.05))
        : 0;

    a.currentTime = safeStart;

    try {
      await a.play();
      setListeningMode(true);
    } catch (err) {
      console.error("Play error:", err);
      setListeningMode(false);
    }
  };

  return (
    <main>
      <div className={"mx-0 p-6 max-w-275 w-[min(95vw, 1110px)]"}>
        {appState === "loading" && (
          <Modal>
            <>
              <h2 className="mt-0">🎵 Loading Calibration Settings...</h2>
              <p className="text-gray-400 text-base/1.6">
                Please wait a moment while we load your saved calibration
                settings and initialize audio.
              </p>
            </>
          </Modal>
        )}

        {/* modal */}

        {assessment && showResultsModal && (
          <AssessmentResults result={assessment} onClose={handleCloseResults} />
        )}
        {/* assessment results */}

        {appState === "countdown" && (
          <div className="fixed inset-0 bg-black bg-opacity-85 flex items-center justify-center z-999">
            <div className="text-center">
              <div
                style={{ color: isBeatOne ? "#22c55e" : "#3b82f6" }}
                className="text-9xl font-bold"
              >
                {currentBeat}
              </div>
              <div className="text-2xl text-gray-400 mt-4">
                Count-in: {countdownBeats} beats at {tempo} BPM
              </div>
              <div className="text-sm text-gray-500 mt-2">
                Get ready to play...
              </div>
            </div>
          </div>
        )}
        {/* countdown */}

        {appState === "processing" && (
          <Modal>
            <h2 className="mt-0">Analyzing Performance...</h2>
            <p className="text-gray-400">Detecting beat grid from recording.</p>
          </Modal>
        )}
        {/* loading screen after performance */}

        <h1 className="mt-0">Sightreading Practice</h1>

        {appState !== "loading" && (
          <>
            <div className="flex gap-3 mb-4 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Instrument</label>
                <select
                  value={instrument}
                  onChange={(e) => setInstrument(e.target.value)}
                  disabled={controlsDisabled}
                  style={standardInputStyle}
                >
                  {Object.entries(INSTRUMENTS).map(([key, instr]) => (
                    <option key={key} value={key}>
                      {instr.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* instrument selection */}

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Bars</label>
                <select
                  value={settings?.bars ?? -1}
                  onChange={(e) =>
                    setSettings({ ...settings, bars: Number(e.target.value) })
                  }
                  disabled={controlsDisabled}
                  style={standardInputStyle}
                >
                  <option value={2}>2 bars</option>
                  <option value={4}>4 bars</option>
                  <option value={8}>8 bars</option>
                </select>
              </div>
              {/* # bars */}

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Difficulty</label>
                <select
                  value={settings?.difficulty ?? -1}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      difficulty: Number(e.target.value) as 1 | 2 | 3 | 4 | 5,
                    })
                  }
                  disabled={controlsDisabled}
                  style={standardInputStyle}
                >
                  <option value={1}>1 - Beginner</option>
                  <option value={2}>2 - Easy</option>
                  <option value={3}>3 - Medium</option>
                  <option value={4}>4 - Hard</option>
                  <option value={5}>5 - Expert</option>
                </select>
              </div>
              {/* difficulty */}

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Tempo</label>
                <input
                  type="number"
                  min={40}
                  max={240}
                  value={tempo}
                  onChange={(e) => setTempo(Number(e.target.value))}
                  disabled={controlsDisabled}
                  style={{ ...standardInputStyle, width: 80 }}
                />
              </div>
              {/* tempo */}

              <button
                onClick={() => handleGenerate()}
                disabled={appState === "performing" || appState === "countdown"}
                style={{
                  cursor:
                    appState === "performing" || appState === "countdown"
                      ? "not-allowed"
                      : "pointer",
                  alignSelf: "flex-end",
                  opacity:
                    appState === "performing" || appState === "countdown"
                      ? 0.5
                      : 1,
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold border-0 py-2 px-4 rounded-lg"
                title="Generate new exercise"
              >
                🎲
              </button>
              {/* new random exercise */}

              {difficultyChanged && (
                <button
                  onClick={() => {
                    console.log(
                      `Update difficulty clicked, now calling handleGenerate() (difficulty ${settings?.difficulty ?? "N/A"})`,
                    );
                    handleGenerate(false);
                    setDifficultyChanged(false);
                  }}
                  disabled={
                    appState === "performing" || appState === "countdown"
                  }
                  style={{
                    cursor:
                      appState === "performing" || appState === "countdown"
                        ? "not-allowed"
                        : "pointer",
                    alignSelf: "flex-end",
                    opacity:
                      appState === "performing" || appState === "countdown"
                        ? 0.5
                        : 1,
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold border-0 py-2 px-4 rounded-lg"
                >
                  🏋️‍♀️ Update Difficulty
                </button>
              )}
              {/* update difficulty */}

              {generated && settings && (
                <button
                  onClick={handleShare}
                  disabled={
                    appState === "performing" || appState === "countdown"
                  }
                  style={{
                    cursor:
                      appState === "performing" || appState === "countdown"
                        ? "not-allowed"
                        : "pointer",
                    alignSelf: "flex-end",
                    opacity:
                      appState === "performing" || appState === "countdown"
                        ? 0.5
                        : 1,
                  }}
                  className="bg-purple-500 hover:bg-purple-600 text-white border-0 py-2 px-4 rounded-lg font-semibold cursor-pointer"
                >
                  📋 Share
                </button>
              )}
              {/* share button */}

              {generated && appState === "ready" && (
                <button
                  onClick={handleStart}
                  style={{ alignSelf: "flex-end" }}
                  className="bg-green-500 hover:bg-green-600 text-white border-0 py-2 px-4 rounded-lg font-semibold cursor-pointer"
                >
                  ▶ Start Performance
                </button>
              )}
              {/* start performance */}

              {appState === "ready" && (
                <button
                  onClick={playTonic}
                  title={getTonicDisplay()}
                  style={{ alignSelf: "flex-end" }}
                  className="bg-gray-900 hover:bg-gray-800 text-white border border-gray-700 py-2 px-4 rounded-lg cursor-pointer font-semibold"
                >
                  ♪ Tuning Fork
                </button>
              )}
              {/* tuning fork */}

              {appState === "performing" && (
                <button
                  onClick={handleStop}
                  style={{ alignSelf: "flex-end" }}
                  className="bg-red-500 hover:bg-red-600 text-white border-0 py-2 px-4 rounded-lg cursor-pointer font-semibold"
                >
                  ⏹ Stop & Assess
                </button>
              )}
              {/* stop and assess */}

              {assessment && (
                <button
                  onClick={() => setShowResultsModal(true)}
                  style={{ alignSelf: "flex-end" }}
                  className="bg-purple-500 hover:bg-purple-600 text-white border-0 py-2 px-4 rounded-lg font-semibold cursor-pointer"
                >
                  📊 Show Results
                </button>
              )}
              {/* show results */}
            </div>

            {/* <CellLibraryView/ /> */}
          </>
        )}
      </div>

      {generated && (
        <div className="py-6 mb-6 max-w-[1100px] w-[min(95vw, 1100px)]">
          <AbcStaff
            score={generated.score}
            currentTime={appState === "performing" ? currentTime : 0}
            tempo={tempo}
            noteResults={assessment?.noteResults}
          />
          {assessment && (
            <ScoreRollView
              score={generated.score}
              performedNotes={playedNoteBlocks}
              stateHistory={graphStateHistory}
              transposeSemitones={transposeSemitones}
              audioRef={audioRef}
              isListening={listeningMode}
              tempo={tempo}
              playbackOffsetSec={playbackOffsetSec}
            />
          )}
          {recordingUrl && (
            <>
              <button
                onClick={toggleListening}
                style={{ background: listeningMode ? "#10b981" : "#111827" }}
                className="text-white border border-gray-700 py-2 px-4 rounded-lg font-semibold cursor-pointer mt-3"
              >
                {listeningMode ? "Stop Listening" : "Listen to Performance"}
              </button>
              <audio
                ref={audioRef}
                src={recordingUrl}
                preload="auto"
                onEnded={() => {
                  setListeningMode(false);
                }}
                onPause={() => {
                  setListeningMode(false);
                }}
                className="hidden"
              />
            </>
          )}
        </div>
      )}
    </main>
  );
}
