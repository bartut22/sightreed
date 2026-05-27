// debug file to show cell previews
import { Cell, CellUpgrade } from "./cellLibrary";
import { Score, KeySig, Event, totalTicks, TICKS_PER_QUARTER, midiToPitchSpellingInKey } from "./notation";

export function cellToScore(
  cell: Cell | CellUpgrade, 
  key: KeySig, 
  tonicMidi: number, 
  scale: number[] = [0, 2, 4, 5, 7, 9, 11]
): Score {
  const ticks = totalTicks(cell.durs);
  const beats = Math.max(1, Math.round(ticks / TICKS_PER_QUARTER));
  const timeSig = { beats: beats, beatUnit: 4 };

  const events: Event[] = [];
  
  for (let i = 0; i < cell.durs.length; i++) {
    const dur = cell.durs[i];
    const isRest = cell.isRest?.[i] === true;

    if (isRest) {
      events.push({ kind: "rest", dur });
    } else {
      const relStep = cell.scaleDegs[i] ?? 0;
      const stepsUp = ((relStep % scale.length) + scale.length) % scale.length;
      const octaves = Math.floor(relStep / scale.length);
      const increment = scale[stepsUp] + octaves * 12;
      
      const midiNote = tonicMidi + increment; 

      events.push({
        kind: "note",
        dur,
        pitch: midiToPitchSpellingInKey(midiNote, key),
      });
    }
  }

  return {
    key,
    measures: [{ timeSig, events }]
  };
}