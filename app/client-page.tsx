"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startAudio,
  getAudioContext,
  getAudioStream,
  stopAudio,
  initAudioContext,
} from "@/lib/audio";
import { Metronome } from "@/lib/metronome";
import AbcStaff from "@/components/AbcStaff";
import AssessmentResults from "@/components/AssessmentResults";
import {
  generatePhrase,
  TONIC_TO_NUMBER,
  type GenerationSettings,
} from "@/lib/generatePhrase";
import tuning_fork from "../public/tuning-fork.svg";
import reedlogo2 from "../public/reedlogo2.png";
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

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";

/* import all the icons in Free Solid, Free Regular, and Brands styles */
import { fas } from "@fortawesome/free-solid-svg-icons";
import { far } from "@fortawesome/free-regular-svg-icons";
import { fab } from "@fortawesome/free-brands-svg-icons";
import Image from "next/image";
import SettingsModal from "@/components/SettingsModal";
import ServerProfileModal from "@/components/ServerProfileModal";
import { User } from "@supabase/supabase-js";
import { Profile } from "./page";
import { Cell, CellUpgrade } from "@/lib/cellLibrary";
import CellPreviewList from "@/components/CellPreviewList";
import React from "react";
import FeedbackForm from "@/components/FeedbackForm";

library.add(fas, far, fab);

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

export default function Home({
  user,
  profile,
}: {
  user: User | null;
  profile: Profile | null;
}) {
  const [appState, setAppState] = useState<AppState>("ready");
  const [currentBeat, setCurrentBeat] = useState(0);
  const [isBeatOne, setIsBeatOne] = useState(false);
  const [countdownBeats, setCountdownBeats] = useState(0);

  const [settings, setSettings] = useState<GenerationSettings>({
    bars: 2,
    difficulty: 2,
  });
  // const [settingsChanged, setSettingsChanged] = useState<boolean>(false);

  const [tempo, setTempo] = useState(120);

  const [generated, setGenerated] = useState<{
    score: Score;
    cells: (Cell | CellUpgrade)[];
    seed: number;
    range: { minMidi: number; maxMidi: number };
  } | null>(null);
  const pendingAssessmentRef = useRef<{
    score: Score;
    difficulty: 1 | 2 | 3 | 4 | 5;
  } | null>(null);
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
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

  const [zoomLevel, setZoomLevel] = useState<number>(0.01);

  const [isPlayingTonic, setIsPlayingTonic] = useState(false);

  const [isMicDenied, setIsMicDenied] = useState(false);

  const [siteLoaded, setSiteLoaded] = useState(false);

  const [canSeeCells, setCanSeeCells] = useState(false);

  // const listeningSourceRef = useRef<AudioBufferSourceNode | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const metronomeRef = useRef<Metronome | null>(null);

  const hasGeneratedOnMount = useRef(false);

  const tonicMidi = React.useMemo(
    () =>
      generated?.score.key.tonic !== undefined
        ? 60 + TONIC_TO_NUMBER[generated.score.key.tonic]
        : 60,
    [generated?.score.key.tonic],
  );
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

  const openSettings = () => {
    console.log("Hi");
    setShowSettings(true);
  };

  const mainFadeDelay = 1000;
  const finishSiteLoad = useCallback(() => {
    setSiteLoaded(true);
    setTimeout(() => {
      document
        .querySelector("main")
        ?.classList.remove("pointer-events-none", "select-none");
    }, 100);
  }, []);

  const getTonicDisplay = (): string => {
    const keyTonic = generated?.score.key.tonic;
    const tonicNum = keyTonic !== undefined ? TONIC_TO_NUMBER[keyTonic] : 0;

    let tonicMidi = 60 + tonicNum;
    while (tonicMidi < 57) tonicMidi += 12;
    while (tonicMidi > 69) tonicMidi -= 12;
    const writtenNote = midiToNoteName(tonicMidi);

    if (transposeSemitones === 0) {
      return writtenNote;
    }

    const concertMidi = tonicMidi + transposeSemitones;
    const concertNote = midiToNoteName(concertMidi);
    return `${writtenNote} (${concertNote})`;
  };

  const playTonic = () => {
    if (!generated) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    if (isPlayingTonic) return;
    if (ctx.state === "suspended") ctx.resume();

    // const freq = 440 * Math.pow(2, (tonicMidi - 69) / 12);
    const keyTonic = generated?.score.key.tonic;
    const tonicNum = keyTonic !== undefined ? TONIC_TO_NUMBER[keyTonic] : 0;

    let tonicMidi = 60 + tonicNum + transposeSemitones;
    while (tonicMidi < 57) tonicMidi += 12;
    while (tonicMidi > 69) tonicMidi -= 12;

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

    setIsPlayingTonic(true);
    console.log("isPlayingTonic is true");

    fund.stop(ctx.currentTime + noteLength);
    overtone.stop(ctx.currentTime + noteLength);
    ring.stop(ctx.currentTime + noteLength);

    setTimeout(() => {
      setIsPlayingTonic(false);
      console.log("isPlayingTonic is false");
    }, noteLength * 1000);
  };

  useEffect(() => {
    // start audio on mount by waiting for user input!
    const initCtx = () => {
      initAudioContext();
      console.log("initCtx() called");
      window.removeEventListener("click", initCtx);
    };
    window.addEventListener("click", initCtx);
    return () => window.removeEventListener("click", initCtx); // if no one clicks then remove listener
  }, []);

  useEffect(() => {
    console.log(zoomLevel);
  }, [zoomLevel]);

  // // Start/stop microphone based on app state
  // useEffect(() => {
  //   const needsMic = appState === "countdown" || appState === "performing";

  //   const hasStream = !!getAudioStream();

  //   // Turn mic on when entering a state that needs it
  //   if (needsMic && !hasStream) {
  //     console.log("Starting audio...");
  //     startAudio()
  //       .then(() => {
  //         const ctx = getAudioContext();
  //         if (ctx && !metronomeRef.current) {
  //           metronomeRef.current = new Metronome(ctx);
  //         }
  //       })
  //       .catch((e) => {
  //         console.error("Failed to start audio:", e);
  //       });
  //     return;
  //   }

  //   // Turn mic off when leaving states that need it
  //   if (!needsMic && hasStream) {
  //     console.log("Stopping microphone capture...");
  //     stopAudio();
  //   }
  // }, [appState]);

  useEffect(() => {
    const needsMic = appState === "countdown" || appState === "performing";
    const hasStream = !!getAudioStream();

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
    (generateSeed: boolean = true, overrideSettings?: GenerationSettings) => {
      const activeSettings = overrideSettings ?? settings;
      if (!activeSettings) return;
      const { seed, ...settingsWithoutSeed } = activeSettings;
      const gen = generatePhrase(
        generateSeed
          ? { ...settingsWithoutSeed, instrument }
          : {
              ...activeSettings,
              instrument: activeSettings.instrument ?? instrument,
            },
      );
      setGenerated({
        score: gen.score,
        cells: gen.cells,
        seed: gen.seed,
        range: gen.range ?? { minMidi: 60, maxMidi: 88 },
      });
      setAssessment(null);
      setGraphStateHistory([]);
      setPlayedNoteBlocks([]);
      setListeningMode(false);
      // setSettingsChanged(false);
      setPlaybackOffsetSec(0);
      // Update settings with new seed
      setSettings((prev) => ({ ...prev, seed: gen.seed }));

      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
        setRecordingUrl(null);
      }
      // setRecordingMeta(null)

      // Update URL with new seed
      const params = new URLSearchParams({
        seed: gen.seed.toString(),
        bars: (activeSettings.bars ?? -1).toString(),
        difficulty: (activeSettings.difficulty ?? -1).toString(),
        tempo: tempo.toString(),
      });
      window.history.replaceState({}, "", `?${params.toString()}`);
    },
    [settings, tempo, recordingUrl, instrument],
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
      handleGenerate(false, urlSettings); // pass settings directly ↓
    } else {
      console.log("No URL settings found");
      handleGenerate(true);
    }
  }, [handleGenerate]);

  useEffect(() => {
    // Settings changed
    const urlSettings = getUrlParamsForGeneration(window.location.search);
    if (!urlSettings) return;
    console.log(`Current url: ${window.location.search}`);
    console.log(
      `Current settings: ${JSON.stringify(settings)}\nSettings from URL: ${JSON.stringify(urlSettings)}`,
    );

    // if (settings) setSettingsChanged(Object.is(settings, urlSettings));
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
    navigator.share({
      title: "Sightreed Exercise",
      text: "Check out this free sightreading exercise!",
      url: url,
    });
    // navigator.clipboard
    //   .write([
    //     new ClipboardItem({
    //       "text/plain": new Blob([url], { type: "text/plain" }),
    //     }),
    //   ])
    //   .then(() => {
    //     alert("Link copied to clipboard!");
    //   });
  };

  const handleStart = async () => {
    if (!generated) return;

    // request mic here instead of on mount
    try {
      await startAudio();
    } catch (e) {
      setIsMicDenied(true);
      return;
    }

    const ctx = getAudioContext();
    if (!ctx) return; // show modal or something idk
    if (ctx && !metronomeRef.current) {
      metronomeRef.current = new Metronome(ctx);
    }

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
    <>
      <div
        className={`w-screen h-screen fixed flex items-center transition duration-1000 z-999 pointer-events-none select-none ${siteLoaded ? "bg-[rgba(0,0,0,0)] opacity-0" : "screen-cover"}`}
      >
        <h1
          className={`w-screen my-auto relative text-center text-3xl font-semibold`}
        >
          Loading...
        </h1>
      </div>
      <main
        className={`mx-auto max-w-275 w-[min(95vw,1110px)]  transition-opacity duration-1000 delay-${mainFadeDelay} ${siteLoaded ? "opacity-100" : "opacity-0"}} pointer-events-none select-none`}
      >
        <div
          className={`bg-neutral-900 rounded-lg border-2 border-zinc-800 my-2 mx-0 p-6 max-w-275 w-[min(95vw,1110px)]`}
        >
          {assessment && showResultsModal && (
            <AssessmentResults
              result={assessment}
              onClose={handleCloseResults}
            />
          )}

          {showSettings && (
            <SettingsModal
              onClose={() => setShowSettings(false)}
              instrument={instrument}
              setInstrument={setInstrument}
              controlsDisabled={controlsDisabled}
              standardInputStyle={standardInputStyle}
              settings={settings}
              setSettings={setSettings}
              handleGenerate={handleGenerate}
              tempo={tempo}
              setTempo={setTempo}
            />
          )}

          {showProfileModal && (
            <ServerProfileModal
              onClose={() => setShowProfileModal(false)}
              user={user}
              profile={profile}
            />
          )}

          {isMicDenied && (
            <Modal onClose={() => setIsMicDenied(false)}>
              <h2 className="mt-0">We couldn&apos;t hear you 🎙️</h2>{" "}
              <p className="text-gray-400">
                Sightreed needs your microphone to follow along while you play.
                It looks like access was blocked — this is usually a quick fix.
                Check the permissions icon in your browser&apos;s address bar,
                allow the microphone, and hit Start when you&apos;re ready.{" "}
              </p>
              <button
                onClick={() => setIsMicDenied(false)}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg border-0 cursor-pointer"
              >
                Okay, I&apos;ll fix it
              </button>
            </Modal>
          )}

          {/* assessment results */}

          {appState === "countdown" && (
            <div className="fixed inset-0 bg-opacity-0 flex items-center justify-center z-999">
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
            <Modal onClose={() => console.log("idk")}>
              <h2 className="mt-0">Analyzing Performance...</h2>
              <p className="text-gray-400">
                Detecting beat grid from recording.
              </p>
            </Modal>
          )}
          {/* loading screen after performance */}

          <div className="flex flex-row gap-1 items-center">
            <Image
              className="size-9 pointer-events-none select-none"
              src={reedlogo2}
              alt="Sightreed Logo"
              width={32}
              height={32}
            ></Image>
            <h1
              id="sightreed-logo-text"
              className="text-3xl mt-0 font-semibold pointer-events-none select-none"
            >
              Sightreed
            </h1>

            {appState !== "loading" && (
              <>
                <div className="flex gap-3 mt-2 mb-2 ml-4 flex-wrap">
                  <button
                    onClick={() => handleGenerate()}
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
                    title="Generate new exercise"
                  >
                    <FontAwesomeIcon icon="dice" />
                  </button>
                  {/* new random exercise */}

                  {generated && settings && (
                    <button
                      aria-label="Share Excerpt"
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
                      <FontAwesomeIcon icon="share-from-square" />
                    </button>
                  )}
                  {/* share button */}

                  {generated && appState === "ready" && (
                    <button
                      aria-label="Start Performance"
                      onClick={handleStart}
                      style={{ alignSelf: "flex-end" }}
                      className="bg-green-500 hover:bg-green-600 text-white border-0 py-2 px-4 rounded-lg font-semibold cursor-pointer"
                    >
                      <FontAwesomeIcon icon="play" />
                    </button>
                  )}
                  {/* start performance */}

                  {appState === "ready" && (
                    <div
                      className={
                        "rounded-lg border border-gray-700 rotate-0 overflow-hidden inline-flex relative " +
                        (isPlayingTonic ? "button-5s-debounce-anim" : "")
                      }
                    >
                      <button
                        onClick={playTonic}
                        title={getTonicDisplay()}
                        style={{ alignSelf: "flex-end" }}
                        className="bg-gray-900 hover:bg-gray-800 text-white py-2 px-4 rounded-lg cursor-pointer font-semibold select-none overflow-hidden"
                      >
                        <Image
                          src={tuning_fork}
                          alt="Tuning Fork"
                          id="tuning-fork"
                          width={22}
                          height={22}
                        />
                      </button>
                    </div>
                  )}
                  {/* tuning fork */}

                  {appState === "performing" && (
                    <button
                      onClick={handleStop}
                      style={{ alignSelf: "flex-end" }}
                      className="bg-red-500 hover:bg-red-600 text-white border-0 py-2 px-4 rounded-lg cursor-pointer font-semibold"
                    >
                      <FontAwesomeIcon icon="stop" />
                    </button>
                  )}
                  {/* stop and assess */}

                  {assessment && (
                    <button
                      onClick={() => setShowResultsModal(true)}
                      style={{ alignSelf: "flex-end" }}
                      className="bg-purple-500 hover:bg-purple-600 text-white border-0 py-2 px-4 rounded-lg font-semibold cursor-pointer"
                    >
                      <FontAwesomeIcon icon="chart-line" />
                    </button>
                  )}
                  {/* show results */}

                  <button
                    onClick={() => {
                      setShowProfileModal(true);
                    }}
                    title="Profile"
                    style={{ alignSelf: "flex-end" }}
                    className="bg-orange-400 hover:bg-orange-500 text-white border-0 border-gray-700 py-2 px-4 rounded-lg cursor-pointer font-semibold"
                  >
                    <FontAwesomeIcon icon="user-large" />
                  </button>

                  {appState === "ready" && (
                    <button
                      onClick={openSettings}
                      title="Settings"
                      style={{ alignSelf: "flex-end" }}
                      className="bg-neutral-400 hover:bg-neutral-500 text-white border-0 border-gray-700 py-2 px-4 rounded-lg cursor-pointer font-semibold"
                    >
                      <FontAwesomeIcon icon="gear" />
                    </button>
                  )}
                  {/* settings */}
                </div>
              </>
            )}
          </div>
        </div>

        {generated && (
          <div className="mb-6 max-w-275 w-[min(95vw,1100px)] rounded-lg overflow-hidden bg-white">
            <div className="flex flex-row justify-between gap-1 px-4">
              {/* <label className="text-xs text-gray-400">Zoom Level</label> */}
              {/* <FontAwesomeIcon icon="fa-solid fa-magnifying-glass-minus" /> */}

              <p
                className="text-xs text-zinc-600 my-auto select-none cursor-help"
                title={"Change your instrument in the settings"}
              >
                Instrument: {INSTRUMENTS[instrument].name}
              </p>

              <div className="flex flex-row gap-1">
                <button
                  aria-label="Zoom Out"
                  onClick={() => setZoomLevel(Math.max(0.01, zoomLevel - 0.5))}
                  disabled={zoomLevel <= 0.01}
                  className={
                    "bg-transparent text-gray-900 py-2 rounded-lg font-semibold select-none text-2xl " +
                    (zoomLevel <= 0.01
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer hover:text-gray-400")
                  }
                >
                  <FontAwesomeIcon icon="magnifying-glass-minus" />
                </button>
                <button
                  aria-label="Zoom In"
                  onClick={() =>
                    setZoomLevel(
                      Math.floor(Math.min(2, zoomLevel + 0.5) * 2) / 2,
                    )
                  }
                  disabled={zoomLevel >= 2}
                  className={
                    "bg-transparent text-gray-900 py-2 rounded-lg font-semibold select-none text-2xl " +
                    (zoomLevel >= 2
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer hover:text-gray-400")
                  }
                >
                  <FontAwesomeIcon icon="magnifying-glass-plus" />
                </button>
              </div>
            </div>
            {/* zoom level */}

            <AbcStaff
              score={generated.score}
              currentTime={appState === "performing" ? currentTime : 0}
              tempo={tempo}
              noteResults={assessment?.noteResults}
              zoomLevel={zoomLevel}
              transposeSemitones={transposeSemitones}
              instrument={instrument}
              canPlay={true}
              onLoad={finishSiteLoad}
            />

            {!assessment && (
              <>
                <label htmlFor="see-cells" className="text-black">
                  See cells
                </label>
                <input
                  id="see-cells"
                  type="checkbox"
                  onChange={(e) =>
                    setCanSeeCells(e.target.checked)
                  }
                ></input>
                {canSeeCells && 
                <div className={`${canSeeCells ? "h-auto" : "h-0"} overflow-hidden`}><CellPreviewList
                  cells={generated.cells}
                  keySig={generated.score.key}
                  tonicMidi={tonicMidi}
                  tempo={tempo}
                  transposeSemitones={transposeSemitones}
                  instrument={instrument}
                  canPlay={false}
                /></div>}
              </>
            )}

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
                minMidi={generated.range.minMidi}
                maxMidi={generated.range.maxMidi}
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


        <FeedbackForm />
      </main>
    </>
  );
}
