// Tone quality analysis via spectral features

export function spectralCentroid(fftData: Float32Array, sampleRate: number): number {
  let weightedSum = 0
  let magnitudeSum = 0

  // fftData is in dB (negative values), convert to linear magnitude
  for (let i = 1; i < fftData.length / 2; i++) {
    // Convert from dB to linear: magnitude = 10^(dB/20)
    const magnitudeDB = fftData[i]
    const magnitude = Math.pow(10, magnitudeDB / 20)
    
    const freq = (i * sampleRate) / (fftData.length * 2) // Note: multiply by 2 for frequency bin calc
    weightedSum += freq * magnitude
    magnitudeSum += magnitude
  }

  return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0
}

export function harmonicToNoiseRatio(
  pitch: number,
  fftData: Float32Array,
  sampleRate: number
): number {
  if (!pitch || pitch < 50) return 0

  // fftData.length is frequencyBinCount, actual FFT size is double
  const fftSize = fftData.length * 2
  const binWidth = sampleRate / fftSize
  const fundBin = Math.round(pitch / binWidth)

  let harmonicEnergy = 0
  let noiseEnergy = 0

  // Track which bins are harmonic regions
  const harmonicBins: Set<number> = new Set()
  
  // Analyze first 8 harmonics
  for (let h = 1; h <= 8; h++) {
    const harmonicBin = fundBin * h
    if (harmonicBin >= fftData.length) break

    // Mark ±3 bins around each harmonic as "harmonic region"
    for (let offset = -3; offset <= 3; offset++) {
      const bin = harmonicBin + offset
      if (bin >= 0 && bin < fftData.length) {
        harmonicBins.add(bin)
      }
    }
  }

  // Separate all bins into harmonic vs noise regions
  for (let i = 1; i < fftData.length; i++) {
    // Convert from dB to linear power
    const magnitudeDB = fftData[i]
    const magnitude = Math.pow(10, magnitudeDB / 20)
    const energy = magnitude * magnitude

    if (harmonicBins.has(i)) {
      harmonicEnergy += energy
    } else {
      noiseEnergy += energy
    }
  }

  // Return in dB (logarithmic scale)
  if (harmonicEnergy <= 0 || noiseEnergy <= 0) return 0
  
  const ratio = harmonicEnergy / noiseEnergy
  return 10 * Math.log10(ratio)
}
