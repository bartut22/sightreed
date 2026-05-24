// Durations: dotted, triplets, and ties
export type Duration =
  | "q" // Quarter
  | "8" // Eighth
  | "q." // Dotted quarter
  | "8." // Dotted eighth
  | "16" // Sixteenth
  | "8t" // Eighth triplet
  | "h" // Half note
  | "h."; // Dotted half

export type PitchSpelling = {
  step: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  alter: -1 | 0 | 1;
  octave: number;
};

export type NoteEvent = {
  kind: "note";
  pitch: PitchSpelling;
  dur: Duration;
  tiedTo?: boolean; // Is this note tied to the next?
  tiedFrom?: boolean; // Is this note tied from the previous?
};

export type RestEvent = {
  kind: "rest";
  dur: Duration;
};

export type Event = NoteEvent | RestEvent;
export type TimeSig = { beats: number; beatUnit: number };

export type KeyTonic =
  | "C"
  | "G"
  | "D"
  | "A"
  | "E"
  | "B"
  | "F#"
  | "C#"
  | "F"
  | "Bb"
  | "Eb"
  | "Ab"
  | "Db"
  | "Gb"
  | "Cb";

export type KeyMode = "major" | "minor";

export type KeySig = {
  tonic: KeyTonic;
  mode: KeyMode;
};

const FIFTHS_POS: Record<KeyTonic, number> = {
  Cb: -7,
  Gb: -6,
  Db: -5,
  Ab: -4,
  Eb: -3,
  Bb: -2,
  F: -1,
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  "F#": 6,
  "C#": 7,
};

// numbers based on circ of 5ths
const SHARPS_ORDER = [6, 1, 8, 3, 10, 5, 0]; // F C G D A E B
const FLATS_ORDER = [10, 3, 8, 1, 6, 11, 4]; // B E A D G C F

const SHARP_SPELLINGS: Record<
  number,
  { step: PitchSpelling["step"]; alter: 1 }
> = {
  6: { step: "F", alter: 1 },
  1: { step: "C", alter: 1 },
  8: { step: "G", alter: 1 },
  3: { step: "D", alter: 1 },
  10: { step: "A", alter: 1 },
  5: { step: "E", alter: 1 },
  0: { step: "B", alter: 1 },
};

const FLAT_SPELLINGS: Record<
  number,
  { step: PitchSpelling["step"]; alter: -1 }
> = {
  10: { step: "B", alter: -1 },
  3: { step: "E", alter: -1 },
  8: { step: "A", alter: -1 },
  1: { step: "D", alter: -1 },
  6: { step: "G", alter: -1 },
  11: { step: "C", alter: -1 },
  4: { step: "F", alter: -1 },
};

const NATURAL_SPELLINGS: Record<
  number,
  { step: PitchSpelling["step"]; alter: 0 }
> = {
  0: { step: "C", alter: 0 },
  2: { step: "D", alter: 0 },
  4: { step: "E", alter: 0 },
  5: { step: "F", alter: 0 },
  7: { step: "G", alter: 0 },
  9: { step: "A", alter: 0 },
  11: { step: "B", alter: 0 },
};

export function getPreferredSpellings(
  key: KeySig,
): Map<number, { step: PitchSpelling["step"]; alter: -1 | 0 | 1 }> {
  const pos = FIFTHS_POS[key.tonic];
  const overrides = new Map<
    number,
    { step: PitchSpelling["step"]; alter: -1 | 0 | 1 }
  >();

  if (pos > 0) {
    SHARPS_ORDER.slice(0, pos).forEach((pc) =>
      overrides.set(pc, SHARP_SPELLINGS[pc]),
    );
  } else if (pos < 0) {
    FLATS_ORDER.slice(0, -pos).forEach((pc) =>
      overrides.set(pc, FLAT_SPELLINGS[pc]),
    );
  }

  return overrides;
}

export function midiToPitchSpellingInKey(
  midi: number,
  key: KeySig,
): PitchSpelling {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const overrides = getPreferredSpellings(key);
  const spelled =
    overrides.get(pc) ?? NATURAL_SPELLINGS[pc] ?? SHARP_SPELLINGS[pc];
    const STEP_NATURAL_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
    const stepPc = STEP_NATURAL_PC[spelled.step];
    const correctedOctave = spelled.alter === -1 && stepPc < pc ? octave + 1 : octave;
  return { ...spelled, octave: correctedOctave };
}

export type Measure = {
  timeSig: TimeSig;
  events: Event[];
};

export type Score = {
  measures: Measure[];
  key: KeySig;
};

// Tick system (24 ticks per quarter for triplet support)
export const TICKS_PER_QUARTER = 48;
export const TICKS_PER_EIGHTH = 24;
export const TICKS_PER_TRIPLET = 16;
export const TICKS_PER_DOTTED_QUARTER = 72;
export const TICKS_PER_DOTTED_EIGHTH = 36;
export const TICKS_PER_HALF = 96;
export const TICKS_PER_DOTTED_HALF = 144;
export const TICKS_PER_SIXTEENTH = 12;

export function durToTicks(d: Duration): number {
  switch (d) {
    case "q":
      return TICKS_PER_QUARTER;
    case "8":
      return TICKS_PER_EIGHTH;
    case "16":
      return TICKS_PER_SIXTEENTH;
    case "q.":
      return TICKS_PER_DOTTED_QUARTER;
    case "8.":
      return TICKS_PER_DOTTED_EIGHTH;
    case "8t":
      return TICKS_PER_TRIPLET;
    case "h":
      return TICKS_PER_HALF;
    case "h.":
      return TICKS_PER_DOTTED_HALF;
    default:
      return 0;
  }
}

export function totalTicks(durs: Duration[]): number {
  return durs.reduce((s, d) => s + durToTicks(d), 0);
}

export function measureTicks(ts: TimeSig) {
  return ts.beats * TICKS_PER_QUARTER;
}

// defaults to sharps
// export function midiToPitchSpelling(midi: number): PitchSpelling {
//   const pc = ((midi % 12) + 12) % 12;
//   const octave = Math.floor(midi / 12) - 1;

//   const map: Record<
//     number,
//     { step: PitchSpelling["step"]; alter: -1 | 0 | 1 }
//   > = {
//     0: { step: "C", alter: 0 },
//     1: { step: "C", alter: 1 },
//     2: { step: "D", alter: 0 },
//     3: { step: "D", alter: 1 },
//     4: { step: "E", alter: 0 },
//     5: { step: "F", alter: 0 },
//     6: { step: "F", alter: 1 },
//     7: { step: "G", alter: 0 },
//     8: { step: "G", alter: 1 },
//     9: { step: "A", alter: 0 },
//     10: { step: "A", alter: 1 },
//     11: { step: "B", alter: 0 },
//   };

//   const spelled = map[pc];
//   return { step: spelled.step, alter: spelled.alter, octave };
// }

export function pitchToMidi(p: PitchSpelling) {
  const stepBase: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  return (p.octave + 1) * 12 + stepBase[p.step] + p.alter;
}

export function toVexKey(p: PitchSpelling) {
  const step = p.step.toLowerCase();
  const acc = p.alter === 1 ? "#" : p.alter === -1 ? "b" : "";
  return `${step}${acc}/${p.octave}`;
}
