// components/SettingsModal.tsx
import Modal from "./Modal";
import type { GenerationSettings } from "@/lib/generatePhrase";
import type { CSSProperties } from "react";

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

// Export so page.tsx can import it too
export { INSTRUMENTS };
export type { Instrument };

type Props = {
  onClose: () => void;
  instrument: string;
  setInstrument: (v: string) => void;
  controlsDisabled: boolean;
  standardInputStyle: CSSProperties;
  settings: GenerationSettings;
  setSettings: (s: GenerationSettings) => void;
  handleGenerate: (
    generateSeed: boolean,
    overrideSettings?: GenerationSettings,
  ) => void;
  tempo: number;
  setTempo: (t: number) => void;
};

export default function SettingsModal({
  onClose,
  instrument,
  setInstrument,
  controlsDisabled,
  standardInputStyle,
  settings,
  setSettings,
  handleGenerate,
  tempo,
  setTempo,
}: Props) {
  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-row gap-2 justify-between mb-2">
          <h2 className="mt-0">⚙ Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>

        <p className="text-gray-400 text-base/1.6">
          Updating these will affect the generated music.
        </p>

        {/* Instrument selection */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Instrument</label>
          <select
            value={instrument}
            onChange={(e) => {
              setInstrument(e.target.value);
              handleGenerate(false, { ...settings, instrument: e.target.value });
            }}
            disabled={controlsDisabled}
            style={standardInputStyle}
          >
            {Object.entries(INSTRUMENTS).map(([key, instr]) => (
              <option key={key} value={key}>
                {(instr as Instrument).name}
              </option>
            ))}
          </select>
        </div>

        {/* Difficulty */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Difficulty</label>
          <select
            value={settings?.difficulty ?? -1}
            onChange={(e) => {
              const updated = {
                ...settings,
                difficulty: Number(e.target.value) as 1 | 2 | 3 | 4 | 5,
              };
              setSettings(updated);
              const params = new URLSearchParams({
                seed: settings.seed.toString(),
                bars: (settings.bars ?? -1).toString(),
                difficulty: e.target.value,
                tempo: (settings.tempo ?? 120).toString(),
              });
              window.history.replaceState({}, "", `?${params.toString()}`);
              handleGenerate(false, updated);
            }}
            disabled={controlsDisabled}
            style={standardInputStyle}
          >
            <option value={1}>Beginner</option>
            <option value={2}>Easy</option>
            <option value={3}>Medium</option>
            <option value={4}>Hard</option>
            <option value={5}>Expert</option>
          </select>
        </div>

        {/* # Bars */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Number of Bars</label>
          <select
            value={settings?.bars ?? -1}
            onChange={(e) => {
              const updated = { ...settings, bars: Number(e.target.value) };
              setSettings(updated);
              const params = new URLSearchParams({
                seed: settings.seed.toString(),
                bars: e.target.value,
                difficulty: (settings.difficulty ?? -1).toString(),
                tempo: (settings.tempo ?? 120).toString(),
              });
              window.history.replaceState({}, "", `?${params.toString()}`);
              handleGenerate(false, updated);
            }}
            disabled={controlsDisabled}
            style={standardInputStyle}
          >
            <option value={2}>2 bars</option>
            <option value={4}>4 bars</option>
            <option value={8}>8 bars</option>
          </select>
        </div>

        {/* Tempo */}
        <div className="flex flex-row gap-1 ml-2 items-center">
          <label className="text-gray-400">♩ = </label>
          <input
            type="number"
            min={40}
            max={240}
            value={tempo}
            onChange={(e) => {
              setTempo(Number(e.target.value));
              const params = new URLSearchParams({
                seed: settings.seed.toString(),
                bars: (settings.bars ?? -1).toString(),
                difficulty: (settings.difficulty ?? -1).toString(),
                tempo: e.target.value,
              });
              window.history.replaceState({}, "", `?${params.toString()}`);
            }}
            disabled={controlsDisabled}
            style={{ ...standardInputStyle, width: 80 }}
          />
        </div>
      </div>
    </Modal>
  );
}
