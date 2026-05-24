let audioContext: AudioContext | null = null
let audioStream: MediaStream | null = null

export function initAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  } else if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

export function getAudioContext(): AudioContext | null {
  return audioContext
}

export function getAudioStream(): MediaStream | null {
  return audioStream
}

export function stopAudio() {
  if (audioStream) {
    try {
      audioStream.getTracks().forEach(track => track.stop())
    } catch (e) {
      console.error("Error stopping audio tracks:", e)
    }
    audioStream = null
  }
}

export async function startAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  } })
  audioStream = stream
  const ctx = new AudioContext()
  audioContext = ctx
  console.log('🎧 AudioContext started with sample rate:', ctx.sampleRate)
}
