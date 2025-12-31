export class Metronome {
  private audioContext: AudioContext;
   scheduledClicks: number[] = [];
  private startTime = 0;
  private onBeat?: (beatNumber: number, isBeatOne: boolean) => void;
  private totalBeats = 0;
  private isActive = false;
  private continuousInterval: number | null = null;
  private currentBeatNum = 0;
  private definiteTimeout: NodeJS.Timeout | null = null;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  // New: Start continuous clicking mode
  startContinuous(tempo: number, onBeat?: (beat: number, isBeatOne: boolean) => void) {
    this.stop(); // Clear any existing
    this.onBeat = onBeat;
    this.isActive = true;
    this.currentBeatNum = 0;

    const msPerBeat = (60 / tempo) * 1000;
    
    // Play first click immediately
    this.playClick(this.audioContext.currentTime, true);
    if (this.onBeat) this.onBeat(1, true);
    this.currentBeatNum = 1;

    // Schedule clicks every beat
    this.continuousInterval = window.setInterval(() => {
      if (!this.isActive) return;
      
      this.currentBeatNum++;
      const isBeatOne = (this.currentBeatNum - 1) % 4 === 0;
      
      this.playClick(this.audioContext.currentTime, isBeatOne);
      if (this.onBeat) this.onBeat(this.currentBeatNum, isBeatOne);
    }, msPerBeat);
  }

  // Original count-in mode (keep for compatibility)
  start(tempo: number, beats: number, onComplete: () => void, onBeat?: (beat: number, isBeatOne: boolean) => void) {
    this.stop(); // Clear any existing
    this.onBeat = onBeat;
    this.scheduledClicks = [];
    this.totalBeats = beats;
    this.isActive = true;

    const secondsPerBeat = 60 / tempo;
    this.startTime = this.audioContext.currentTime + 0.1;

    for (let i = 0; i < beats; i++) {
      const time = this.startTime + i * secondsPerBeat;
      this.scheduledClicks.push(time);
      // const isBeatOne = i % 4 === 0;
      // console.log(`start() beat loop iter ${i}`)
      // this.playClick(time, isBeatOne);
    }

    const totalDuration = beats * secondsPerBeat;
    const completionTime = (totalDuration + 0.05) * 1000;
    this.definiteTimeout = setTimeout(() => {
      onComplete();
    }, completionTime);
    
    this.updateBeat(undefined, onComplete);
  }
  
  private updateBeat = (time?: DOMHighResTimeStamp, completeCallback?: () => void) => {
    // console.log(`Updating beats. ${this.scheduledClicks.length} scheduled clicks`)
    if (this.scheduledClicks.length === 0) return;
    if (!this.isActive) {
      this.stop(completeCallback);
    }
    
    const now = this.audioContext.currentTime;
    const nextClickTime = this.scheduledClicks[0];

    if (now >= nextClickTime) {
      const beatNum = this.totalBeats - this.scheduledClicks.length + 1;
      const isBeatOne = (beatNum - 1) % 4 === 0;

      this.playClick(nextClickTime, isBeatOne);
      if (this.onBeat) this.onBeat(beatNum, isBeatOne);

      this.scheduledClicks.shift();
    }

    if (this.scheduledClicks.length > 0) {
      requestAnimationFrame(t => this.updateBeat(t, completeCallback));
    }
  };

  private playClick(time: number, isAccent: boolean) {
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.frequency.value = isAccent ? 1200 : 800;
    gain.gain.setValueAtTime(isAccent ? 0.4 : 0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

    osc.start(time);
    osc.stop(time + 0.05);
  }

  stop(callback?: () => void) {
    // console.log(`Request to stop, current taps = ${this.scheduledClicks.length}`)
    this.isActive = false;
    this.scheduledClicks = [];
    
    if (this.continuousInterval !== null) {
      clearInterval(this.continuousInterval);
      this.continuousInterval = null;
    }

    if (this.definiteTimeout !== null) {
      clearTimeout(this.definiteTimeout);
      this.definiteTimeout = null;
    }

    if (callback) callback();
  }

  isRunning(): boolean {
    return this.isActive;
  }
}
