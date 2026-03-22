import { PitchDetector } from 'pitchy'
import { spectralCentroid, harmonicToNoiseRatio } from './spectral'
import type { TickState } from './performanceTracker'
import type { Score } from './notation'
import { durToTicks, pitchToMidi } from './notation'

// Cooley-Tukey FFT in-place
function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[real[i], real[j]] = [real[j], real[i]]
      ;[imag[i], imag[j]] = [imag[j], imag[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang), wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0
      for (let j = 0; j < len / 2; j++) {
        const uRe = real[i + j], uIm = imag[i + j]
        const vRe = real[i + j + len / 2] * curRe - imag[i + j + len / 2] * curIm
        const vIm = real[i + j + len / 2] * curIm + imag[i + j + len / 2] * curRe
        real[i + j] = uRe + vRe;         imag[i + j] = uIm + vIm
        real[i + j + len / 2] = uRe - vRe; imag[i + j + len / 2] = uIm - vIm
        const nr = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nr
      }
    }
  }
}

// Returns frequencyBinCount (n/2) bins in dB — same format as AnalyserNode.getFloatFrequencyData
function computeFFTdB(frame: Float32Array): Float32Array {
  const n = frame.length
  const real = new Float32Array(n)
  const imag = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1))) // Hanning
    real[i] = frame[i] * w
  }
  fft(real, imag)
  const bins = new Float32Array(n / 2)
  for (let i = 0; i < n / 2; i++) {
    const mag = Math.sqrt(real[i] ** 2 + imag[i] ** 2)
    bins[i] = mag > 0 ? 20 * Math.log10(mag) : -160
  }
  return bins
}

function getExpectedAtTick(tick: number, score: Score): { kind: 'note' | 'rest' | null, pitch: number | null } {
  let cursor = 0
  for (const measure of score.measures) {
    for (const event of measure.events) {
      const dur = durToTicks(event.dur)
      if (tick >= cursor && tick < cursor + dur) {
        return event.kind === 'note'
          ? { kind: 'note', pitch: pitchToMidi((event as any).pitch) }
          : { kind: 'rest', pitch: null }
      }
      cursor += dur
    }
  }
  return { kind: null, pitch: null }
}

export async function analyzeRecording(
  blob: Blob,
  score: Score,
  tempo: number,
  transposeSemitones: number
): Promise<TickState[]> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  await audioCtx.close()

  const { sampleRate } = audioBuffer
  const channelData = audioBuffer.getChannelData(0)
  const frameSize = 2048
  const samplesPerTick = (sampleRate * (60000 / tempo / 48)) / 1000
  const detector = PitchDetector.forFloat32Array(frameSize)
  const stateHistory: TickState[] = []
  const totalTicks = Math.floor(channelData.length / samplesPerTick)

  for (let tick = 0; tick < totalTicks; tick++) {
    const start = Math.floor(tick * samplesPerTick)
    const frame = channelData.slice(start, start + frameSize)
    if (frame.length < frameSize) break

    // RMS
    let sum = 0
    for (let i = 0; i < frame.length; i++) sum += frame[i] ** 2
    const rms = Math.sqrt(sum / frame.length)

    // Pitch
    const [hz, clarity] = detector.findPitch(frame, sampleRate)
    const validHz = clarity > 0.3 && hz > 80 && hz < 1200 ? hz : null
    const midiPitch = validHz
      ? Math.round(69 + 12 * Math.log2(validHz / 440)) - transposeSemitones
      : null

    // Spectral
    const fftData = computeFFTdB(frame)
    const centroid = validHz && rms > 0.01 ? spectralCentroid(fftData, sampleRate) : 0
    const hnr = validHz && rms > 0.01 ? harmonicToNoiseRatio(validHz, fftData, sampleRate) : 0

    // Expected + isCorrect
    const expected = getExpectedAtTick(tick, score)
    let isCorrect = false
    if (expected.kind === 'note') {
      isCorrect = midiPitch !== null && expected.pitch !== null && Math.abs(midiPitch - expected.pitch) <= 1
    } else if (expected.kind === 'rest') {
      isCorrect = midiPitch === null || rms < 0.015
    } else {
      isCorrect = true
    }

    stateHistory.push({
      tick, rawTick: tick,
      expectedKind: expected.kind,
      expectedPitch: expected.pitch,
      actualPitch: midiPitch,
      actualHz: validHz,
      actualRMS: rms,
      isCorrect, centroid, hnr,
    })
  }

  return stateHistory
}
