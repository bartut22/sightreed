import type { TickState } from "./performanceTracker"

/**
 * Detects metronome click times in a recorded audio blob using a bandpass
 * filter around click frequencies (800–1200 Hz) to reject instrument bleed.
 * Returns click positions in milliseconds from the start of the recording.
 */
export async function detectClickTimes(
    blob: Blob,
    tempo: number
): Promise<number[]> {
    const arrayBuffer = await blob.arrayBuffer()

    // Decode
    const decodeCtx = new AudioContext()
    let audioBuffer: AudioBuffer
    try {
        audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0))
    } catch (e) {
        console.error("[beatDetection] Failed to decode audio", e)
        return []
    } finally {
        void decodeCtx.close()
    }

    // Render filtered mono signal
    const filterCtx = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate)
    const source = filterCtx.createBufferSource()
    source.buffer = audioBuffer

    // Wider click band than fixed 1k bandpass
    const hp = filterCtx.createBiquadFilter()
    hp.type = "highpass"
    hp.frequency.value = 700

    const lp = filterCtx.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.value = 5000

    source.connect(hp)
    hp.connect(lp)
    lp.connect(filterCtx.destination)
    source.start()

    const filtered = await filterCtx.startRendering()
    const samples = filtered.getChannelData(0)
    const sr = filtered.sampleRate

    // Peak envelope in short windows (better for transients than RMS 10ms)
    const windowMs = 3
    const windowSamples = Math.max(1, Math.floor((sr * windowMs) / 1000))
    const env: number[] = []

    for (let i = 0; i < samples.length; i += windowSamples) {
        let peak = 0
        const end = Math.min(i + windowSamples, samples.length)
        for (let j = i; j < end; j++) {
            const v = Math.abs(samples[j])
            if (v > peak) peak = v
        }
        env.push(peak)
    }

    if (!env.length) return []

    // Robust adaptive threshold (median + fraction of dynamic range)
    const sorted = [...env].sort((a, b) => a - b)
    const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]
    const median = p(0.5)
    const p90 = p(0.9)
    const threshold = median + 0.35 * (p90 - median)

    const beatIntervalWindows = Math.max(1, Math.round((60000 / tempo) / windowMs))
    const minSpacing = Math.max(1, Math.floor(beatIntervalWindows * 0.45))

    const clicks: number[] = []
    let lastClickIdx = -minSpacing

    for (let i = 1; i < env.length - 1; i++) {
        if (
            env[i] > threshold &&
            env[i] >= env[i - 1] &&
            env[i] >= env[i + 1] &&
            i - lastClickIdx >= minSpacing
        ) {
            clicks.push(i)
            lastClickIdx = i
        }
    }

    const clickTimesMs = clicks.map(i => i * windowMs)
    console.log("[beatDetection]", {
        clicks: clickTimesMs.length,
        median,
        p90,
        threshold
    })
    return clickTimesMs
}

/**
 * Remaps stateHistory ticks using detected click times as the true beat grid.
 * Each rawTick (elapsed ms / msPerTick) is converted relative to beat 1
 * as measured from the actual recording.
 *
 * Falls back to original history if fewer than 2 clicks are found.
 */
export function remapStateHistory(
    history: TickState[],
    clickTimesMs: number[],
    msPerTick: number
): TickState[] {
    if (clickTimesMs.length < 1) {
        console.warn("[beatDetection] Not enough clicks found, using raw state history")
        return history
    }

    const beat1Ms = clickTimesMs[0]
    console.log(`[beatDetection] Beat 1 at ${beat1Ms}ms, remapping ${history.length} ticks`)

    return history.map(s => ({
        ...s,
        tick: Math.round((s.rawTick * msPerTick - beat1Ms) / msPerTick),
    }))
}