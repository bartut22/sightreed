"use client";

import { useMemo } from "react";
import { Cell, CELL_UPGRADES, CellUpgrade } from "../lib/cellLibrary";
import { KeySig } from "../lib/notation";
import { cellToScore } from "../lib/cellToScore";
import AbcStaff from "./AbcStaff";
import React from "react";

type Props = {
  cells: (Cell | CellUpgrade)[];
  keySig: KeySig;
  tonicMidi: number;
  tempo?: number;
  instrument?: string;
  transposeSemitones?: number;
  canPlay?: boolean
};

const noop = () => {};

function areCellPreviewPropsEqual(prev: Props, next: Props) {
  if (prev.cells !== next.cells) { 
    console.log("cells");
    return false;
  }
  
    if (prev.tonicMidi !== next.tonicMidi) {
    console.log("tonicMidi");
    return false;
  }

  if (prev.tempo !== next.tempo) {
    console.log("tempo");
    return false;
  }

  if (prev.instrument !== next.instrument) {
    console.log("instrument");
    return false;
  }

  if (prev.transposeSemitones !== next.transposeSemitones) {
    console.log("transposeSemitones");
    return false;
  }

  if (prev.canPlay !== next.canPlay) {
    console.log("canPlay");
    return false;
  }

  return true;

  // return (
  //   prev.cells === next.cells &&
  //   prev.keySig === next.keySig &&
  //   prev.tonicMidi === next.tonicMidi &&
  //   prev.tempo === next.tempo &&
  //   prev.instrument === next.instrument &&
  //   prev.transposeSemitones === next.transposeSemitones &&
  //   prev.canPlay === next.canPlay
  // );
}

export default React.memo(CellPreviewList, areCellPreviewPropsEqual);

function CellPreviewList({
  cells,
  keySig,
  tonicMidi,
  tempo = 120,
  instrument = "bbclarinet",
  transposeSemitones = 0,
  canPlay = false
}: Props) {
  const cellScores = useMemo(() => {
    return cells.map((cell) => cellToScore(cell, keySig, tonicMidi));
  }, [cells, keySig, tonicMidi]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
      {cellScores.map((score, index) => {
        const baseName = cells[index].baseName;
        const upgradeInLibrary = CELL_UPGRADES[baseName] ?? undefined;
        const upgradeIdx = upgradeInLibrary ? upgradeInLibrary.findIndex(
          (u) => u === (cells[index] as CellUpgrade),
        ) : -1;

        return (
          <div
            key={`cell-preview-${index}`}
            className="flex flex-col bg-white border border-gray-200 rounded shadow-sm p-2"
          >
            <div className="text-xs text-gray-400 font-mono mb-2 uppercase tracking-wider">
              Cell {index + 1} • {score.measures[0].timeSig.beats}/4
            </div>
            <div className="text-xs text-gray-400 font-mono mb-2 uppercase tracking-wider">
              {upgradeIdx == -1 ? "Base cell " : `Upgrade ${upgradeIdx + 1}`} of {baseName}
            </div>

            <div className="grow">
              <AbcStaff
                score={score}
                currentTime={0}
                tempo={tempo}
                zoomLevel={0.8}
                instrument={instrument}
                transposeSemitones={transposeSemitones}
                canPlay={canPlay}
                onLoad={noop}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
