import type {
  Score,
  Event,
  PitchSpelling,
  Duration,
  Measure,
  KeySig,
} from "./notation";
import {
  durToTicks,
  getPreferredSpellings,
  pitchToMidi,
  TICKS_PER_QUARTER,
} from "./notation";

const BASE_UNIT = 8 // L:1/8

/**
 * ABC standard:
 *   C4 = uppercase C (no modifier)
 *   C5 = lowercase c (no modifier)
 *   C6 = c'
 *   C3 = C,
 *   C2 = C,,
 */
function pitchToAbc(p: PitchSpelling, key: KeySig): string {
  const accidental = shouldEmitAccidental(p, key)
    ? p.alter === 1
      ? "^"
      : p.alter === -1
        ? "_"
        : "="
    : "";

  if (p.octave >= 5) {
    // lowercase, apostrophes for each octave above 5
    const letter = p.step.toLowerCase()
    const ticks = "'".repeat(p.octave - 5)
    return `${accidental}${letter}${ticks}`
  } else {
    // octave 4 = uppercase no modifier
    // octave 3 = uppercase + one comma
    // octave 2 = uppercase + two commas
    const letter = p.step.toUpperCase()
    const commas = ",".repeat(Math.max(0, 4 - p.octave))
    return `${accidental}${letter}${commas}`
  }
}

function shouldEmitAccidental(pitch: PitchSpelling, key: KeySig): boolean {
  const pc = pitchToMidi(pitch) % 12
  const spellings = getPreferredSpellings(key)
  // If this pitch class is in the key's accidental map and matches the key spelling, suppress it
  const keySpelling = spellings.get(pc)
  if (!keySpelling) return pitch.alter !== 0  // natural note — only emit if it has an accidental
  return keySpelling.alter !== pitch.alter     // emit only if it differs from what the key implies
}

/**
 * Returns ABC duration suffix relative to L:1/8.
 * Triplets are handled at the group level in eventsToAbc.
 */
function durToAbcLength(dur: Duration): string {
  switch (dur) {
    case "16":
      return "/2";
    case "8":
      return "";
    case "8.":
      return "3/2";
    case "q":
      return "2";
    case "q.":
      return "3";
    case "h":
      return "4";
    case "h.":
      return "6";
    case "qt":
      return "2"; // handled in triplet group
    case "8t":
      return ""; // handled in triplet group
    default:
      return "";
  }
}

function splitCrossBeatEvents(events: Event[]): Event[] {
  const result: Event[] = [];
  let cursor = 0;

  for (const ev of events) {
    const ticks = durToTicks(ev.dur);
    const beatPos = cursor % TICKS_PER_QUARTER;

    if (
      ev.dur === "8" &&
      beatPos !== 0 &&
      beatPos + ticks > TICKS_PER_QUARTER
    ) {
      // Split into two tied 16ths
      const first: Event = { ...ev, dur: "16", tiedTo: true };
      const second: Event = { ...ev, dur: "16" };
      result.push(first, second);
    } else {
      result.push(ev);
    }

    cursor += ticks;
  }

  return result;
}

/**
 * Convert a sequence of events to ABC token strings.
 * Notes within the same quarter-beat are joined without spaces (forces beaming).
 * Beat boundaries get a space (breaks beam).
 * Consecutive 8t events are grouped with (3 prefix.
 */
function eventsToAbc(events: Event[], key: KeySig): string {
  events = splitCrossBeatEvents(events);
  // We'll build "beat groups" — each group is tokens that should be beamed together.
  // Groups are separated by spaces; tokens within a group are joined with no space.
  const beatGroups: string[][] = []
  let currentGroup: string[] = []
  let ticksInBeat = 0 // ticks accumulated within the current quarter-beat

  const flushGroup = () => {
    if (currentGroup.length > 0) {
      beatGroups.push(currentGroup)
      currentGroup = []
    }
  }

  let i = 0
  while (i < events.length) {
    const ev = events[i]

    // ── Triplet group ──────────────────────────────────────────────────────
    if (ev.dur === "8t" || ev.dur === "qt") {
      flushGroup();
      ticksInBeat = 0;

      while (
        i < events.length &&
        (events[i].dur === "8t" || events[i].dur === "qt")
      ) {
        // Collect one bracket's worth: accumulate until real ticks % TICKS_PER_QUARTER === 0
        const bracketEvents: Event[] = [];
        let bracketTicks = 0;

        while (
          i < events.length &&
          (events[i].dur === "8t" || events[i].dur === "qt")
        ) {
          const tev = events[i];
          const tevTicks = durToTicks(tev.dur);
          bracketEvents.push(tev);
          bracketTicks += tevTicks;
          i++;
          if (bracketTicks % TICKS_PER_QUARTER === 0) break;
        }

        // r = number of events in this bracket
        const r = bracketEvents.length;

        // Start new group with the (3:2:r prefix
        const noteTokens = bracketEvents.map((tev) => {
          const len = durToAbcLength(tev.dur);
          if (tev.kind === "rest") return `z${len}`;
          const tie = tev.tiedTo ? "-" : "";
          return `${pitchToAbc(tev.pitch, key)}${len}${tie}`;
        });
        currentGroup.push(`(3:2:${r} ${noteTokens.join("")}`);

        flushGroup();
      }

      ticksInBeat = 0;
      continue;
    }

    // ── Normal event ───────────────────────────────────────────────────────
    const eventTicks = durToTicks(ev.dur)
    const len = durToAbcLength(ev.dur)
    let token: string

    if (ev.kind === "rest") {
      token = `z${len}`
    } else {
      const tie = ev.tiedTo ? "-" : ""
      token = `${pitchToAbc(ev.pitch, key)}${len}${tie}`
    }

    // Events >= a quarter note always get their own group (they are never beamed)
    if (eventTicks >= TICKS_PER_QUARTER) {
      flushGroup()
      ticksInBeat = 0
      beatGroups.push([token])
      i++
      continue
    }

    // Sub-quarter: check if adding this event crosses a beat boundary
    if (ticksInBeat > 0 && ticksInBeat + eventTicks > TICKS_PER_QUARTER) {
      // This note crosses a beat — flush current group, start new one
      flushGroup()
      ticksInBeat = 0
    }

    currentGroup.push(token)
    ticksInBeat += eventTicks

    // If we've exactly filled a beat, flush
    if (ticksInBeat >= TICKS_PER_QUARTER) {
      flushGroup()
      ticksInBeat = 0
    }

    i++
  }

  flushGroup()

  // Join groups with spaces (beam break), tokens within group with no space
  return beatGroups.map(g => g.join("")).join(" ")
}

/**
 * Convert a single Measure to ABC body + trailing barline.
 */
function measureToAbc(measure: Measure, isLast: boolean, key: KeySig): string {
  const body = eventsToAbc(measure.events, key)
  const barline = isLast ? "|]" : "|"
  return `${body} ${barline}`
}

/**
 * Convert a Score to a full ABC string.
 * Score is expected to already be in the written (transposed) key.
 * Key signature is always C (no sharps/flats) until Score supports key sigs.
 *
 * @param score  - Score in written key
 * @param title  - Optional title for T: field
 * @param tempo  - BPM (quarter note = tempo) for Q: field
 * @param barsPerLine - Number of bars per line
 */
export function scoreToAbc(score: Score): string {
  const firstMeasure = score.measures[0]
  const ts = firstMeasure?.timeSig ?? { beats: 4, beatUnit: 4 }
  const ks = `K:${score.key.tonic}${score.key.mode === "major" ? "" : (score.key.mode === "minor" ? "m" : "")}`
  // console.log(ks);

  const header = [
    "X:1",
    `M:${ts.beats}/${ts.beatUnit}`,
    `L:1/${BASE_UNIT}`,
    `%%stretchlast 0.6`,
    `%%equalbars 1`,
    ks,
  ].filter(Boolean).join("\n")

  const body = score.measures
    .map((m, idx) => measureToAbc(m, idx === score.measures.length - 1, score.key))
    .join(" ")

  return `${header}\n${body}`
}