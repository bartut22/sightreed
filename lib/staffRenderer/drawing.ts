import { StaffConfig, DrawItem, NoteColor } from "./types"
import { Duration, NoteEvent } from "../notation"

/**
 * Draw a note head (filled or hollow)
 */
export function drawNoteHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  durTicks: number,
  color: string,
  config: StaffConfig
): void {
  ctx.beginPath()
  ctx.ellipse(
    x, y,
    config.noteHeadWidth,
    config.noteHeadHeight,
    config.noteHeadRotation,
    0, Math.PI * 2
  )

  if (durTicks >= 96) { // Half note or longer - hollow
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()
  } else { // Quarter note or shorter - filled
    ctx.fillStyle = color
    ctx.fill()
  }
}

/**
 * Draw a stem for a note
 */
export function drawStem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  config: StaffConfig
): { stemX: number; stemTopY: number } {
  const stemX = x + config.noteHeadWidth - 1
  const stemTopY = y - config.stemLength

  ctx.beginPath()
  ctx.moveTo(stemX, y)
  ctx.lineTo(stemX, stemTopY)
  ctx.lineWidth = config.stemWidth
  ctx.strokeStyle = color
  ctx.stroke()

  return { stemX, stemTopY }
}

/**
 * Draw ledger lines above or below the staff
 */
export function drawLedgerLines(
  ctx: CanvasRenderingContext2D,
  x: number,
  step: number,
  staffBottomStep: number,
  staffTopStep: number,
  stepToYFn: (step: number) => number,
  color: string,
  config: StaffConfig
): void {
  ctx.lineWidth = 1

  // Below staff
  if (step < staffBottomStep) {
    for (let s = staffBottomStep - 2; s >= step; s -= 2) {
      const y = stepToYFn(s)
      ctx.strokeStyle = color
      ctx.beginPath()
      ctx.moveTo(x - config.ledgerLineExtension, y)
      ctx.lineTo(x + config.ledgerLineExtension, y)
      ctx.stroke()
    }
  }

  // Above staff
  if (step > staffTopStep) {
    for (let s = staffTopStep + 2; s <= step; s += 2) {
      const y = stepToYFn(s)
      ctx.strokeStyle = color
      ctx.beginPath()
      ctx.moveTo(x - config.ledgerLineExtension, y)
      ctx.lineTo(x + config.ledgerLineExtension, y)
      ctx.stroke()
    }
  }
}

/**
 * Draw a dotted rhythm dot
 */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x + 15, y, 3, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Draw a beam connecting two or more notes
 */
export function drawBeam(
  ctx: CanvasRenderingContext2D,
  notes: DrawItem[],
  color: string,
  config: StaffConfig
): void {
  if (notes.length < 2) return

  const beamY = Math.min(...notes.map(n => n.stemTopY!)) - 2
  const xLeft = notes[0].stemX!
  const xRight = notes[notes.length - 1].stemX!

  // Draw beam
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(xLeft, beamY)
  ctx.lineTo(xRight, beamY)
  ctx.stroke()

  // Redraw stems to beam
  ctx.lineWidth = config.stemWidth
  for (const n of notes) {
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(n.stemX!, n.y!)
    ctx.lineTo(n.stemX!, beamY)
    ctx.stroke()
  }
}

/**
 * Draw double beam for sixteenth notes
 */
export function drawDoubleBeam(
  ctx: CanvasRenderingContext2D,
  notes: DrawItem[],
  color: string,
  config: StaffConfig
): void {
  if (notes.length < 2) return

  const beamY = Math.min(...notes.map(n => n.stemTopY!)) - 2
  const xLeft = notes[0].stemX!
  const xRight = notes[notes.length - 1].stemX!

  // Draw primary beam (top)
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(xLeft, beamY)
  ctx.lineTo(xRight, beamY)
  ctx.stroke()

  // Draw secondary beam (below primary, 6px gap)
  const secondaryBeamY = beamY + 6
  ctx.beginPath()
  ctx.moveTo(xLeft, secondaryBeamY)
  ctx.lineTo(xRight, secondaryBeamY)
  ctx.stroke()

  // Redraw stems to primary beam
  ctx.lineWidth = config.stemWidth
  for (const n of notes) {
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(n.stemX!, n.y!)
    ctx.lineTo(n.stemX!, beamY)
    ctx.stroke()
  }
}

/**
 * Draw primary beam for all notes, and secondary beam only for sixteenth notes
 * Used for mixed eighth/sixteenth patterns like "eighth-sixteenth-sixteenth"
 */
export function drawMixedBeam(
  ctx: CanvasRenderingContext2D,
  allNotes: DrawItem[],
  sixteenthNotes: DrawItem[],
  color: string,
  config: StaffConfig
): void {
  if (allNotes.length < 2) return

  const beamY = Math.min(...allNotes.map(n => n.stemTopY!)) - 2

  // Draw primary beam across ALL notes (eighths and sixteenths)
  const xLeft = allNotes[0].stemX!
  const xRight = allNotes[allNotes.length - 1].stemX!

  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(xLeft, beamY)
  ctx.lineTo(xRight, beamY)
  ctx.stroke()

  // Draw secondary beam only for consecutive sixteenth notes
  if (sixteenthNotes.length >= 2) {
    const secondaryBeamY = beamY + 6
    const sixteenthXLeft = sixteenthNotes[0].stemX!
    const sixteenthXRight = sixteenthNotes[sixteenthNotes.length - 1].stemX!

    ctx.beginPath()
    ctx.moveTo(sixteenthXLeft, secondaryBeamY)
    ctx.lineTo(sixteenthXRight, secondaryBeamY)
    ctx.stroke()
  }

  // Redraw all stems to primary beam
  ctx.lineWidth = config.stemWidth
  for (const n of allNotes) {
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(n.stemX!, n.y!)
    ctx.lineTo(n.stemX!, beamY)
    ctx.stroke()
  }
}

/**
 * Draw a partial secondary beam (stub) for a single sixteenth next to an eighth
 * Example: eighth + single sixteenth
 */
export function drawPartialSecondaryBeam(
  ctx: CanvasRenderingContext2D,
  sixteenthNote: DrawItem,
  direction: "left" | "right",
  color: string,
  config: StaffConfig
): void {
  const beamY = sixteenthNote.stemTopY! - 2
  const secondaryBeamY = beamY + 6
  const stemX = sixteenthNote.stemX!
  
  const stubLength = 12  // Length of partial beam
  
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.beginPath()
  
  if (direction === "left") {
    ctx.moveTo(stemX, secondaryBeamY)
    ctx.lineTo(stemX - stubLength, secondaryBeamY)
  } else {
    ctx.moveTo(stemX, secondaryBeamY)
    ctx.lineTo(stemX + stubLength, secondaryBeamY)
  }
  
  ctx.stroke()
}


/**
 * Draw a sixteenth note flag (double flag)
 */
export function drawSixteenthFlag(
  ctx: CanvasRenderingContext2D,
  stemX: number,
  stemTopY: number,
  color: string
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  
  // First flag
  ctx.beginPath()
  ctx.moveTo(stemX, stemTopY)
  ctx.quadraticCurveTo(stemX + 14, stemTopY + 4, stemX + 6, stemTopY + 16)
  ctx.stroke()
  
  // Second flag (below first)
  ctx.beginPath()
  ctx.moveTo(stemX, stemTopY + 6)
  ctx.quadraticCurveTo(stemX + 14, stemTopY + 10, stemX + 6, stemTopY + 22)
  ctx.stroke()
}

/**
 * Draw an eighth note flag
 */
export function drawFlag(
  ctx: CanvasRenderingContext2D,
  stemX: number,
  stemTopY: number,
  color: string
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(stemX, stemTopY)
  ctx.quadraticCurveTo(stemX + 14, stemTopY + 4, stemX + 6, stemTopY + 16)
  ctx.stroke()
}

/**
 * Draw a tie between two notes
 */
export function drawTie(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
  color: string
): void {
  const controlY = y + 15
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x1, y)
  ctx.quadraticCurveTo((x1 + x2) / 2, controlY, x2, y)
  ctx.stroke()
}

/**
 * Draw triplet bracket and number
 */
export function drawTripletBracket(
  ctx: CanvasRenderingContext2D,
  group: DrawItem[],
  notes: DrawItem[],
  staffTop: number,
  config: StaffConfig
): void {
  const xLeft = group[0].x - 20
  const xRight = group[group.length - 1].x + 20

  let bracketY: number
  if (notes.length >= 2) {
    bracketY = Math.min(...notes.map(n => n.stemTopY!)) - 16
  } else if (notes.length === 1) {
    bracketY = notes[0].stemTopY! - 45
  } else {
    bracketY = staffTop - 20
  }

  ctx.strokeStyle = config.primaryColor
  ctx.fillStyle = config.primaryColor
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(xLeft, bracketY + 5)
  ctx.lineTo(xLeft, bracketY)
  ctx.lineTo(xRight, bracketY)
  ctx.lineTo(xRight, bracketY + 5)
  ctx.stroke()

  ctx.font = config.tripletFont
  ctx.fillText("3", (xLeft + xRight) / 2 - 5, bracketY - 4)
}

/**
 * Draw rest symbol based on duration
 */
export function drawRest(
  ctx: CanvasRenderingContext2D,
  x: number,
  durTicks: number,
  restBaselineY: number,
  config: StaffConfig
): void {
  ctx.fillStyle = config.primaryColor

  if (durTicks === 24) { // Eighth rest
    ctx.font = "40px serif"
    ctx.fillText("\uD834\uDD3E", x - 14, restBaselineY)
  } else if (durTicks === 48) { // Quarter rest
    ctx.font = config.restFont
    ctx.fillText("𝄽", x - 12, restBaselineY)
  } else if (durTicks === 96) { // Half rest
    ctx.font = config.restFont
    ctx.fillText("𝄼", x - 12, restBaselineY - 10)
  } else if (durTicks === 72) { // Dotted quarter rest
    ctx.font = config.restFont
    ctx.fillText("𝄽", x - 12, restBaselineY)
    drawDot(ctx, x + 5, restBaselineY - 15, config.primaryColor)
  } else if (durTicks === 36) { // Dotted eighth rest
    ctx.font = "40px serif"
    ctx.fillText("\uD834\uDD3E", x - 14, restBaselineY)
    drawDot(ctx, x + 5, restBaselineY - 15, config.primaryColor)
  } else if (durTicks === 144) { // Dotted half rest
    ctx.font = config.restFont
    ctx.fillText("𝄼", x - 12, restBaselineY - 10)
    drawDot(ctx, x + 5, restBaselineY - 25, config.primaryColor)
  } else if (durTicks === 16) { // Sixteenth rest
    ctx.font = config.restFont
    ctx.fillText("\uD834\uDD3E", x - 12, restBaselineY)
  }
}

/**
 * Draw staff lines
 */
export function drawStaffLines(
  ctx: CanvasRenderingContext2D,
  config: StaffConfig,
  canvasWidth: number
): void {
  ctx.strokeStyle = config.primaryColor
  ctx.lineWidth = 1

  for (let i = 0; i < 5; i++) {
    const y = config.staffTop + i * config.lineSpacing
    ctx.beginPath()
    ctx.moveTo(config.leftPad, y)
    ctx.lineTo(canvasWidth - config.rightPad, y)
    ctx.stroke()
  }
}

/**
 * Draw treble clef
 */
export function drawClef(
  ctx: CanvasRenderingContext2D,
  config: StaffConfig
): void {
  const clef = "\uD834\uDD1E"
  ctx.fillStyle = config.primaryColor
  ctx.font = config.clefFont
  const clefX = config.leftPad + 6
  const clefBaselineY = config.staffTop + 4 * config.lineSpacing
  ctx.fillText(clef, clefX, clefBaselineY)
}

/**
 * Draw bar lines between measures
 */
export function drawBarLines(
  ctx: CanvasRenderingContext2D,
  measureCount: number,
  measureTicks: number,
  x0: number,
  tickW: number,
  config: StaffConfig
): void {
  ctx.strokeStyle = config.primaryColor
  ctx.lineWidth = 2

  for (let b = 1; b < measureCount; b++) {
    const x = x0 + b * measureTicks * tickW
    ctx.beginPath()
    ctx.moveTo(x, config.staffTop)
    ctx.lineTo(x, config.staffTop + 4 * config.lineSpacing)
    ctx.stroke()
  }
}

/**
 * Draw title above staff
 */
export function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  config: StaffConfig
): void {
  ctx.fillStyle = config.primaryColor
  ctx.font = config.titleFont
  ctx.fillText(title, config.leftPad, 28)
}

/**
 * Draw playhead line
 */
export function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  config: StaffConfig
): void {
  ctx.strokeStyle = config.playheadColor
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, config.staffTop - 10)
  ctx.lineTo(x, config.staffTop + 4 * config.lineSpacing + 10)
  ctx.stroke()
}

/**
 * Draw accidental symbol
 */
export function drawAccidental(
  ctx: CanvasRenderingContext2D,
  accidental: string,
  x: number,
  y: number,
  color: string,
  config: StaffConfig
): void {
  ctx.fillStyle = color
  ctx.font = config.accidentalFont
  ctx.fillText(accidental, x - 20, y + 5)
}
