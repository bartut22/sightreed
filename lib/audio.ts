import { PitchDetector } from "pitchy"
import { spectralCentroid, harmonicToNoiseRatio } from "./spectral"

const HISTORY_SIZE = 3
const CLARITY_THRESHOLD = 0.3
const MAX_SEMITONE_JUMP = 5
const MIN_SUSTAIN_FRAMES = 2

const MIN_PITCH = 80
const MAX_PITCH = 1200

let detector: ReturnType<typeof PitchDetector.forFloat32Array> | null = null
let inputBuffer: Float32Array<ArrayBuffer> = new Float32Array(0)
let fftBuffer: Float32Array<ArrayBuffer> = new Float32Array(0)
let pitchHistory: number[] = []
let lastDisplayedPitch: number | null = null
let audioContext: AudioContext | null = null
let candidatePitch: number | null = null
let candidateFrameCount = 0

// ✅ Debug counter
let frameCount = 0

export function getAudioContext(): AudioContext | null {
  return audioContext
}

export async function startAudio(
  onPitch: (p: number | null) => void,
  onRms: (r: number) => void,
  onClarity?: (c: number) => void,
  onSpectral?: (centroid: number, hnr: number) => void
) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const ctx = new AudioContext()
  audioContext = ctx
  console.log('🎧 AudioContext started with sample rate:', ctx.sampleRate)

  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  source.connect(analyser)

  inputBuffer = new Float32Array(analyser.fftSize)
  fftBuffer = new Float32Array(analyser.frequencyBinCount)
  detector = PitchDetector.forFloat32Array(analyser.fftSize)

  // console.log('🎤 Audio started:', {
  //   sampleRate: ctx.sampleRate,
  //   fftSize: analyser.fftSize,
  //   frequencyBinCount: analyser.frequencyBinCount
  // })

  function tick() {
    frameCount++

    analyser.getFloatTimeDomainData(inputBuffer)
    analyser.getFloatFrequencyData(fftBuffer)

    // Calculate RMS
    let sum = 0
    for (let i = 0; i < inputBuffer.length; i++) sum += inputBuffer[i] ** 2
    const rms = Math.sqrt(sum / inputBuffer.length)
    onRms(rms)

    // // ✅ Debug every 60 frames (about once per second)
    // if (frameCount % 60 === 0) {
    //   console.log('🔊 Frame', frameCount, '| RMS:', rms.toFixed(4), '| FFT[0-5]:', 
    //     Array.from(fftBuffer.slice(0, 6)).map(v => v.toFixed(1)).join(', '))
    // }

    // Detect pitch
    const [pitch, clarity] = detector!.findPitch(inputBuffer, ctx.sampleRate)
    if (onClarity) onClarity(clarity)

    const validPitch = pitch && clarity >= CLARITY_THRESHOLD && pitch >= MIN_PITCH && pitch <= MAX_PITCH
      ? pitch
      : null

    // ✅ SIMPLIFIED: Always calculate and send spectral data when sound detected
    if (rms > 0.01 && validPitch) {
      const centroid = spectralCentroid(fftBuffer, ctx.sampleRate)
      const hnr = harmonicToNoiseRatio(validPitch, fftBuffer, ctx.sampleRate)

      // if (frameCount % 10 === 0) {
      //   console.log('📊 Spectral | Pitch:', validPitch.toFixed(1), 'Hz | Centroid:',
      //     centroid.toFixed(0), 'Hz | HNR:', hnr.toFixed(1), 'dB')
      // }

      if (onSpectral) onSpectral(centroid, hnr)
    } else {
      if (onSpectral) onSpectral(0, 0)
    }

    // Handle pitch history for stable display
    if (validPitch) {
      if (candidatePitch) {
        const semitoneDiff = Math.abs(12 * Math.log2(validPitch / candidatePitch))

        if (semitoneDiff < 1.0) {
          candidateFrameCount++

          if (candidateFrameCount >= MIN_SUSTAIN_FRAMES) {
            pitchHistory.push(validPitch)
            if (pitchHistory.length > HISTORY_SIZE) pitchHistory.shift()

            const sorted = [...pitchHistory].sort((a, b) => a - b)
            const medianPitch = sorted[Math.floor(sorted.length / 2)]

            lastDisplayedPitch = medianPitch
            onPitch(medianPitch)
          }
        } else {
          candidatePitch = validPitch
          candidateFrameCount = 1
        }
      } else {
        candidatePitch = validPitch
        candidateFrameCount = 1
      }
    } else {
      candidatePitch = null
      candidateFrameCount = 0
      pitchHistory = []
      lastDisplayedPitch = null
      onPitch(null)
    }

    requestAnimationFrame(tick)
  }

  tick()
}
