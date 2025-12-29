export type ArticulationType = "normal" | "staccato" | "legato" | "accent"

export class ArticulationDetector {
  private rmsHistory: number[] = []
  private readonly HISTORY_SIZE = 10

  /**
   * Detects articulation based on note characteristics
   * Staccato notes are typically 25-50% of their notated duration
   */
  detectArticulation(
    durationTicks: number,
    expectedDurationTicks: number,
    rms: number,
    onsetSharpness: number
  ): ArticulationType {
    this.rmsHistory.push(rms)
    if (this.rmsHistory.length > this.HISTORY_SIZE) {
      this.rmsHistory.shift()
    }

    const avgRMS = this.rmsHistory.reduce((a, b) => a + b, 0) / this.rmsHistory.length
    const durationRatio = durationTicks / expectedDurationTicks

    // Accent: significantly louder than average with sharp attack
    if (rms > avgRMS * 1.5 && onsetSharpness > 0.7) {
      return "accent"
    }

    // Staccato: short duration (< 50% of expected) with sharp onset
    if (durationRatio < 0.5 && onsetSharpness > 0.6) {
      return "staccato"
    }

    // Legato: smooth onset, full duration
    if (onsetSharpness < 0.3 && durationRatio >= 0.9) {
      return "legato"
    }

    return "normal"
  }

  /**
   * Calculates onset sharpness from RMS envelope
   * Sharp attacks reach 80% of max RMS quickly
   */
  calculateOnsetSharpness(rmsWindow: number[]): number {
    if (rmsWindow.length < 3) return 0

    const maxRMS = Math.max(...rmsWindow)
    const attackTime = rmsWindow.findIndex(r => r >= maxRMS * 0.8)
    
    // Sharper attacks reach 80% faster (0-5 frames is sharp)
    return attackTime <= 0 ? 1.0 : Math.max(0, 1.0 - attackTime / 10)
  }

  reset() {
    this.rmsHistory = []
  }
}
