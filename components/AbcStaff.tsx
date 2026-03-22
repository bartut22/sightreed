"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Score } from "../lib/notation";
import { durToTicks, TICKS_PER_QUARTER } from "../lib/notation";
import { scoreToAbc } from "../lib/scoreToAbc";

// ── Config ───────────────────────────────────────────────────────────────────

const MAX_CONTAINER_WIDTH = 1100;
// const PIXELS_PER_BAR = 350;
const RESIZE_DEBOUNCE_MS = 500;

// ── Types ────────────────────────────────────────────────────────────────────

type NoteResult = { tick: number; passed: boolean };

type Props = {
  score: Score;
  title?: string;
  currentTime: number;
  tempo: number;
  noteResults?: NoteResult[];
};

type NoteXMap = Array<{ tickOffset: number; x: number }>;

// ── Helpers (unchanged) ───────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function AbcStaff({
  score,
  currentTime,
  tempo,
  // noteResults,
}: Props) {
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
    if (!wrapperRef.current || !containerRef.current) return;

    const containerWidth = wrapperRef.current.clientWidth;
    const barsPerLine = containerWidth >= 200 ? 4 : 2;

    const abcString = scoreToAbc(score);
    containerRef.current.innerHTML = "";

    import("abcjs").then((abcjs) => {
      if (!containerRef.current || !wrapperRef.current) return;

      abcjs.renderAbc(containerRef.current, abcString, {
        add_classes: true,
        stafftopmargin: 0,
        staffwidth: containerWidth,
        wrap: {
          preferredMeasuresPerLine: barsPerLine,
          minSpacing: 1.8,
          maxSpacing: 2.7,
        },
      });

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
      }

      requestAnimationFrame(rebuildNoteXMap);
    });
  }, [score, rebuildNoteXMap]);

  // ── Initial render ───────────────────────────────────────────────────────
  useEffect(() => {
    renderAbc();
  }, [renderAbc]);

  // ── ResizeObserver on WRAPPER (not container) ────────────────────────────
  useEffect(() => {
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
  }, [renderAbc]);

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
    <div
      ref={wrapperRef}
      style={{ maxWidth: MAX_CONTAINER_WIDTH }}
      className="relative w-full mx-0 my-auto"
    >
      {/* containerRef: abc.js renders into here */}
      <div ref={containerRef} id="abcjs-container" className="abc-staff-theme" />

      {/* Playhead overlay */}
      <div
        ref={playheadRef}
        style={{ willChange: "transform", transform: "translateX(0px)" }}
        className="absolute top-0 left-0 w-0.5 h-full bg-blue-500 pointer-events-none opacity-0 transition-opacity duration-100 ease-linear"
      />
    </div>
  );
}
