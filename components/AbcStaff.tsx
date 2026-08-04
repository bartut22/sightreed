"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { Score } from "../lib/notation";
import { durToTicks, TICKS_PER_QUARTER } from "../lib/notation";
import { scoreToAbc } from "../lib/scoreToAbc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import abcjs, { MidiBuffer } from "abcjs";
import { getAudioContext, initAudioContext } from "@/lib/audio";
import React from "react";
import { abcSVGNodeCache } from "@/lib/abcSVGCache";

// ── Config ───────────────────────────────────────────────────────────────────

const MAX_CONTAINER_WIDTH = 1100;
// const PIXELS_PER_BAR = 350;
const RESIZE_DEBOUNCE_MS = 500;

// ── Types ────────────────────────────────────────────────────────────────────

export type NoteResult = { tick: number; passed: boolean };

type Props = {
  score: Score;
  title?: string;
  currentTime: number;
  tempo: number;
  noteResults?: NoteResult[];
  zoomLevel: number;
  transposeSemitones?: number;
  instrument: string;
  canPlay: boolean;
  onLoad: () => void;
};

type NoteXMap = Array<{ tickOffset: number; x: number }>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTickOffsets(score: Score): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const measure of score.measures) {
    for (const ev of measure.events) {
      offsets.push(cursor);
      cursor += durToTicks(ev.dur);
    }
  }
  return offsets;
}

function scoreTotalTicks(score: Score): number {
  return score.measures.reduce(
    (sum, m) => sum + m.events.reduce((s, e) => s + durToTicks(e.dur), 0),
    0,
  );
}

function timeToTick(seconds: number, tempo: number): number {
  const ticksPerSecond = (tempo / 60) * TICKS_PER_QUARTER;
  return seconds * ticksPerSecond;
}

function buildNoteXMap(
  container: HTMLDivElement,
  tickOffsets: number[],
  score: Score,
): NoteXMap {
  const containerRect = container.getBoundingClientRect();
  const noteEls = Array.from(
    container.querySelectorAll<SVGElement>(".abcjs-note"),
  );

  const noteTickOffsets: number[] = [];
  let evIdx = 0;
  for (const measure of score.measures) {
    for (const ev of measure.events) {
      if (ev.kind === "note") noteTickOffsets.push(tickOffsets[evIdx]);
      evIdx++;
    }
  }

  const map: NoteXMap = [];
  const count = Math.min(noteEls.length, noteTickOffsets.length);
  for (let i = 0; i < count; i++) {
    const rect = noteEls[i].getBoundingClientRect();
    const x = rect.left + rect.width / 2 - containerRect.left;
    map.push({ tickOffset: noteTickOffsets[i], x });
  }
  return map;
}

function interpolateX(
  map: NoteXMap,
  currentTick: number,
  totalTicks: number,
  containerWidth: number,
): number | null {
  if (map.length === 0) return null;
  if (currentTick <= map[0].tickOffset) return map[0].x;
  if (currentTick >= totalTicks) return containerWidth;

  for (let i = 0; i < map.length - 1; i++) {
    const a = map[i];
    const b = map[i + 1];
    if (currentTick >= a.tickOffset && currentTick < b.tickOffset) {
      const t = (currentTick - a.tickOffset) / (b.tickOffset - a.tickOffset);
      return a.x + t * (b.x - a.x);
    }
  }

  const last = map[map.length - 1];
  const t = (currentTick - last.tickOffset) / (totalTicks - last.tickOffset);
  return last.x + t * (containerWidth - last.x);
}

// const INSTRUMENTS: Record<string, Instrument> = {
//   flute: { name: "Flute", transposeSemitones: 0 },

//   bbClarinet: { name: "Bb Clarinet", transposeSemitones: -2 },
//   bbSoprano: { name: "Bb Soprano Sax", transposeSemitones: -2 },
//   bbTenor: { name: "Bb Tenor Sax", transposeSemitones: -14 },

//   ebClarinet: { name: "Eb Clarinet", transposeSemitones: 3 },
//   ebAlto: { name: "Eb Alto Sax", transposeSemitones: -9 },
//   ebBaritone: { name: "Eb Baritone Sax", transposeSemitones: -21 },

//   fHorn: { name: "F Horn", transposeSemitones: -7 },

//   trumpet: { name: "Trumpet", transposeSemitones: -2 },
// };
function midiProgramNumber(instrument: string): number {
  switch (instrument) {
    case "flute":
      return 73;
    case "bbClarinet":
      return 71;
    case "bbSoprano":
      return 64;
    case "bbTenor":
      return 66;
    case "ebClarinet":
      return 71;
    case "ebAlto":
      return 65;
    case "ebBaritone":
      return 67;
    case "fHorn":
      return 60;
    case "trumpet":
      return 56;
    default:
      return 65; // Default to piano
  }
}

function abcStaffPropsAreEqual(prev: Props, next: Props): boolean {
  if (
    prev.score === next.score &&
    prev.currentTime === next.currentTime &&
    prev.tempo === next.tempo &&
    prev.zoomLevel === next.zoomLevel &&
    prev.transposeSemitones === next.transposeSemitones &&
    prev.instrument === next.instrument &&
    prev.canPlay === next.canPlay &&
    prev.onLoad === next.onLoad
  ) {
    return true;
  }

  if (prev.score !== next.score) {
    if (prev.score.key.tonic !== next.score.key.tonic) return false;
    if (prev.score.key.mode !== next.score.key.mode) return false;
    if (prev.score.measures.length !== next.score.measures.length) return false;
    for (let m = 0; m < prev.score.measures.length; m++) {
      const pm = prev.score.measures[m];
      const nm = next.score.measures[m];
      if (pm.events.length !== nm.events.length) return false;
      for (let e = 0; e < pm.events.length; e++) {
        const pe = pm.events[e];
        const ne = nm.events[e];
        if (pe.kind !== ne.kind || pe.dur !== ne.dur) return false;
        if (pe.kind === "note" && ne.kind === "note" && pe.pitch !== ne.pitch)
          return false;
      }
    }
  }

  return (
    prev.currentTime === next.currentTime &&
    prev.tempo === next.tempo &&
    prev.zoomLevel === next.zoomLevel &&
    prev.transposeSemitones === next.transposeSemitones &&
    prev.instrument === next.instrument &&
    prev.canPlay === next.canPlay &&
    prev.onLoad === next.onLoad
  );
}

export default React.memo(AbcStaff, abcStaffPropsAreEqual);

// ── Component ─────────────────────────────────────────────────────────────────

export function AbcStaff({
  score,
  currentTime,
  tempo,
  zoomLevel,
  transposeSemitones,
  instrument,
  canPlay,
  onLoad,
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  // wrapperRef measures the true available width — never touched by abc.js
  const wrapperRef = useRef<HTMLDivElement>(null);
  // containerRef is what abc.js renders into
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const noteXMapRef = useRef<NoteXMap>([]);
  const totalTicksRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const currentTimeRef = useRef(currentTime);
  const tempoRef = useRef(tempo);
  const zoomLevelRef = useRef(zoomLevel);
  const synthRef = useRef<MidiBuffer | null>(null);
  const renderedRef = useRef<abcjs.TuneObject | null>(null);
  const primedRef = useRef<{ status: string; duration: number }>(null);
  const isPlayingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  useEffect(() => {
    tempoRef.current = tempo;
  }, [tempo]);

  // ── Scrape note positions ────────────────────────────────────────────────
  const rebuildNoteXMap = useCallback(() => {
    if (!containerRef.current) return;
    const tickOffsets = buildTickOffsets(score);
    totalTicksRef.current = scoreTotalTicks(score);
    noteXMapRef.current = buildNoteXMap(
      containerRef.current,
      tickOffsets,
      score,
    );
  }, [score]);

  // ── Core render function ─────────────────────────────────────────────────
  const renderAbc = useCallback(() => {
    console.log("renderAbc called", {
      cacheSize: abcSVGNodeCache?.size,
      containerWidth: wrapperRef.current?.clientWidth,
      score: score,
    });
    if (!wrapperRef.current || !containerRef.current || !zoomLevelRef.current)
      return;
    // console.log("renderABC() at zoom level " + zoomLevelRef.current);
    onLoad();

    const containerWidth = wrapperRef.current.clientWidth;
    const barsPerLine = containerWidth >= 200 ? 4 : 2;

    const abcString = scoreToAbc(score);
    const transposedAbcString = // allows for midi playback of transposing instruments.
      transposeSemitones != 0
        ? `%%MIDI transpose ${transposeSemitones}\n${abcString}`
        : abcString;

    // console.log(transposedAbcString);

    const scale = 1.25 + 0.25 * zoomLevelRef.current;
    const cacheKey = `${transposedAbcString}|${scale}|${containerWidth}`;

    const t0 = performance.now();

    const cachedNode = abcSVGNodeCache.get(cacheKey);
    if (cachedNode) {
      const t1 = performance.now();

      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(cachedNode.cloneNode(true));
      const t2 = performance.now();

      // renderedRef.current = null; // no playback needed for cell previews
      requestAnimationFrame(() => {
        const t3 = performance.now();
        console.log("cache hit timings", {
          lookup: t1 - t0,
          cloneAndAttach: t2 - t1,
          untilNextFrame: t3 - t2,
          total: t3 - t0,
          key: cacheKey.slice(0, 60),
        });
        rebuildNoteXMap();
      });
      return;
    }

    containerRef.current.innerHTML = "";

    const rendered = abcjs.renderAbc(
      containerRef.current,
      transposedAbcString,
      {
        add_classes: true,
        stafftopmargin: 0,
        scale: 1.25 + 0.25 * zoomLevelRef.current,
        staffwidth: containerWidth,
        selectTypes: false,
        foregroundColor: "black",
        paddingtop: 0,
        wrap: {
          preferredMeasuresPerLine: barsPerLine,
          minSpacing: 1.8,
          maxSpacing: 2.7,
        },
      },
    );
    renderedRef.current = rendered[0];
    synthRef.current = null;

    const svg = containerRef.current.querySelector("svg");
    if (svg) {
      const svgWidth = parseFloat(svg.getAttribute("width") ?? "0");
      if (svgWidth > 0) {
        const svgHeight = parseFloat(svg.getAttribute("height") ?? "0");
        svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.style.width = "100%";
        svg.style.height = "100%";
      }

      document.querySelector("#abcjs-container title")?.remove();
    }

    if (svg && cacheKey) {
      abcSVGNodeCache.set(cacheKey, svg.cloneNode(true) as SVGSVGElement);
    }

    requestAnimationFrame(rebuildNoteXMap);
  }, [score, rebuildNoteXMap, transposeSemitones, onLoad]);

  // ── Initial render ───────────────────────────────────────────────────────
  useEffect(() => {
    renderAbc();
  }, [renderAbc]);

  // Dedicated effect for zoom changes
  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
    renderAbc(); // explicitly re-render when zoom changes
  }, [zoomLevel, renderAbc]);

  // ── ResizeObserver on WRAPPER (not container) ────────────────────────────
  useEffect(() => {
    if (!canPlay) return;
    if (!wrapperRef.current) return;
    let resizeTimeout: NodeJS.Timeout | null = null;

    const observer = new ResizeObserver(() => {
      if (resizeTimeout !== null) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(renderAbc, RESIZE_DEBOUNCE_MS);
    });

    observer.observe(wrapperRef.current);

    return () => {
      observer.disconnect();
      if (resizeTimeout !== null) clearTimeout(resizeTimeout);
    };
  }, [renderAbc, canPlay]);

  // ── Playhead rAF loop ────────────────────────────────────────────────────
  const startPlayhead = useCallback(() => {
    if (rafRef.current !== null) return;

    const tick = () => {
      if (!playheadRef.current || !containerRef.current) return;
      const currentTick = timeToTick(currentTimeRef.current, tempoRef.current);
      const x = interpolateX(
        noteXMapRef.current,
        currentTick,
        totalTicksRef.current,
        containerRef.current.clientWidth,
      );

      if (x === null) {
        playheadRef.current.style.opacity = "0";
      } else {
        playheadRef.current.style.opacity = "1";
        playheadRef.current.style.transform = `translateX(${x}px)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopPlayhead = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (playheadRef.current) playheadRef.current.style.opacity = "0";
  }, []);

  useEffect(() => {
    if (currentTime > 0) startPlayhead();
    else stopPlayhead();
  }, [currentTime, startPlayhead, stopPlayhead]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    // wrapperRef: measures true available width, never modified
    <>
      <div
        ref={wrapperRef}
        style={{ maxWidth: MAX_CONTAINER_WIDTH }}
        className="relative w-full mx-0 my-auto"
      >
        {/* containerRef: abc.js renders into here */}
        <div
          ref={containerRef}
          id="abcjs-container"
          className="abc-staff-theme"
        />

        {/* Playhead overlay */}
        <div
          ref={playheadRef}
          style={{ willChange: "transform", transform: "translateX(0px)" }}
          className="absolute top-0 left-0 w-0.5 h-full bg-blue-500 pointer-events-none opacity-0 transition-opacity duration-100 ease-linear"
        />
      </div>

      {canPlay && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-row gap-1 justify-start">
            <button
              onClick={async () => {
                if (isPlaying) {
                  if (synthRef.current) {
                    synthRef.current.stop();
                    setIsPlaying(false);
                  }
                  return;
                }
                // play the midi file using abcjs
                let ctx = getAudioContext();
                if (!ctx) {
                  initAudioContext();
                  ctx = getAudioContext();
                }
                if (!ctx) return;
                if (ctx.state !== "running") await ctx.resume();

                if (!renderedRef.current) return;

                if (!synthRef.current) {
                  const synth = new abcjs.synth.CreateSynth();
                  await synth.init({
                    audioContext: ctx,
                    visualObj: renderedRef.current,
                    millisecondsPerMeasure:
                      (60 / tempo) * score.measures[0].timeSig.beats * 1000,
                    options: {
                      soundFontUrl:
                        "/soundfonts/FatBoy/",
                      program: midiProgramNumber(instrument),
                      soundFontVolumeMultiplier: 2.5,
                    },
                  });
                  primedRef.current = await synth.prime();
                  synthRef.current = synth;
                }

                if (synthRef.current) {
                  if (!primedRef.current) return;
                  setIsPlaying(true);
                  if (isPlayingTimeoutRef.current) {
                    clearTimeout(isPlayingTimeoutRef.current);
                  }
                  synthRef.current.start();
                  isPlayingTimeoutRef.current = setTimeout(
                    () => setIsPlaying(false),
                    primedRef.current.duration * 1000,
                  );
                }
              }}
              className={
                "bg-transparent ml-4 text-gray-900 py-2 rounded-lg font-semibold select-none text-2xl cursor-pointer"
              }
            >
              <FontAwesomeIcon icon={isPlaying ? "pause" : "play"} />
            </button>
          </div>
        </div>
      )}
      {/* play / stop midi */}
    </>
  );
}
