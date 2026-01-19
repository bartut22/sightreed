import { Duration, Event, PitchSpelling, Score } from "../notation"

export type StaffConfig = {
  canvasWidth?: number
  canvasHeight?: number
  staffTop: number
  lineSpacing: number
  leftPad: number
  rightPad: number
  clefPad?: number
  afterClefPad?: number
  
  noteHeadWidth: number
  noteHeadHeight: number
  noteHeadRotation: number
  stemLength: number
  stemWidth: number
  ledgerLineExtension: number
  
  clefFont: string
  titleFont: string
  restFont: string
  tripletFont: string
  accidentalFont: string
  
  primaryColor: string
  correctNoteColor: string
  incorrectNoteColor: string
  playheadColor: string
  
  trebleBottomLineMidi: number
  measureTicks?: number
}

export type CanvasSizing = {
  mode: "fixed" | "responsive" | "container"
  width?: number
  height?: number
  aspectRatio?: number
}

export type ClefType = "treble" | "bass" | "alto" | "tenor"
export type TimeSignature = { beats: number; beatUnit: number }

export interface MusicalConfig {
  clef: ClefType
  timeSignature: TimeSignature
  keySignature?: number // -7 to 7 (flats to sharps)
}

export type DrawItem = {
  event: Event
  x: number
  durTicks: number
  tick: number
  measureIndex: number
  eventIndex: number
  y?: number
  stemX?: number
  stemTopY?: number
  isBeamed?: boolean
  isTriplet?: boolean
  passed?: boolean
}

export type RenderState = {
  score: Score
  title?: string
  currentTime?: number
  tempo?: number
  noteResults?: Array<{ tick: number; passed: boolean }>
}

export type NoteColor = {
  noteHead: string
  stem: string
  accidental: string
}
