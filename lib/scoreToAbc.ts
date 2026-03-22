import type { Score, Event, NoteEvent, RestEvent, PitchSpelling, Duration, Measure } from "./notation"
import { durToTicks, TICKS_PER_QUARTER } from "./notation"

const BASE_UNIT = 8 // L:1/8

/**
 * ABC standard:
 *   C4 = uppercase C (no modifier)
 *   C5 = lowercase c (no modifier)
 *   C6 = c'
 *   C3 = C,
 *   C2 = C,,
 */
function pitchToAbc(p: PitchSpelling): string {
  const accidental = p.alter === 1 ? "^" : p.alter === -1 ? "_" : ""

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

/**
 * Returns ABC duration suffix relative to L:1/8.
 * Triplets are handled at the group level in eventsToAbc.
 */
function durToAbcLength(dur: Duration): string {
  switch (dur) {
    case "16":  return "/2"
    case "8":   return ""
    case "8.":  return "3/2"
    case "q":   return "2"
    case "q.":  return "3"
    case "h":   return "4"
    case "h.":  return "6"
    case "8t":  return ""     // handled in triplet group
    default:    return ""
  }
}

/**
 * Convert a sequence of events to ABC token strings.
 * Notes within the same quarter-beat are joined without spaces (forces beaming).
 * Beat boundaries get a space (breaks beam).
 * Consecutive 8t events are grouped with (3 prefix.
 */
function eventsToAbc(events: Event[]): string {
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
    if (ev.dur === "8t") {
      // Triplets span exactly one quarter beat (3 × 1/3 quarter = 1 quarter).
      // Flush current group first so triplet starts cleanly.
      flushGroup()
      ticksInBeat = 0

      const tripletGroup: Event[] = []
      while (i < events.length && events[i].dur === "8t") {
        tripletGroup.push(events[i])
        i++
      }

      // Each (3 group of 3 is one beat — emit as one beam group
      for (let t = 0; t < tripletGroup.length; t++) {
        if (t % 3 === 0) {
          if (t > 0) flushGroup()
          currentGroup.push("(3")
        }
        const tev = tripletGroup[t]
        if (tev.kind === "rest") {
          currentGroup.push("z")
        } else {
          const tie = tev.tiedTo ? "-" : ""
          currentGroup.push(`${pitchToAbc(tev.pitch)}${tie}`)
        }
      }
      flushGroup()
      ticksInBeat = 0
      continue
    }

    // ── Normal event ───────────────────────────────────────────────────────
    const eventTicks = durToTicks(ev.dur)
    const len = durToAbcLength(ev.dur)
    let token: string

    if (ev.kind === "rest") {
      token = `z${len}`
    } else {
      const tie = ev.tiedTo ? "-" : ""
      token = `${pitchToAbc(ev.pitch)}${len}${tie}`
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
function measureToAbc(measure: Measure, isLast: boolean): string {
  const body = eventsToAbc(measure.events)
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
export function scoreToAbc(score: Score, title?: string, tempo?: number, barsPerLine?: number): string {
  const firstMeasure = score.measures[0]
  const ts = firstMeasure?.timeSig ?? { beats: 4, beatUnit: 4 }

  const header = [
    "X:1",
    `T:${title ?? ""}`,
    `M:${ts.beats}/${ts.beatUnit}`,
    `L:1/${BASE_UNIT}`,
    tempo ? `Q:1/4=${tempo}` : "",
    barsPerLine ? `%%barsperline ${barsPerLine}` : "",
    `%%stretchlast yes`,
    "K:C",
  ].filter(Boolean).join("\n")

  const body = score.measures
    .map((m, idx) => measureToAbc(m, idx === score.measures.length - 1))
    .join(" ")

  return `${header}\n${body}`
}