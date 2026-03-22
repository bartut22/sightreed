import { StaffConfig, RenderState, DrawItem, LineLayout } from "./types"
import {
    drawStaffLines,
    drawClef,
    drawBarLines,
    drawTitle,
    drawNoteHead,
    drawStem,
    drawLedgerLines,
    drawAccidental,
    drawDot,
    drawRest,
    drawBeam,
    drawFlag,
    drawTie,
    drawTripletBracket,
    drawPlayhead,
    drawDoubleBeam,
    drawSixteenthFlag,
    drawPartialSecondaryBeam,
    drawMixedBeam
} from "./drawing"
import {
    calculateNotePositions,
    calculateEighthOnlyBeamGroups,
    calculateMixedBeamGroups,
    calculateTripletGroups,
    calculatePlayheadX,
} from "./layout"
import {
    midiToDiatonicStep,
    pitchToMidi,
    getAccidentalFromPitch,
    stepToY as calculateStepY
} from "./music"
import { TICKS_PER_QUARTER, NoteEvent, Score } from "../notation"

// Global spacing and layout constants
const SCALE = 1  // Rendering scale multiplier (0.5 = half size, 2.0 = double size)
const BASE_MEASURES_PER_800PX = 2  // Base measures per 800px at scale 1.0
const LINE_GAP = 88  // Space between staves in pixels -- 20px is one staff line
const TITLE_HEIGHT = 40  // Space reserved for title
const CANVAS_BOTTOM_PADDING = 20  // Space at bottom of canvas

export const DEFAULT_PHRASE_STAFF_CONFIG: StaffConfig = {
    staffTop: 120,
    lineSpacing: 18,
    leftPad: 50,
    rightPad: 30,
    clefPad: 50,
    afterClefPad: 16,

    noteHeadWidth: 8,
    noteHeadHeight: 6,
    noteHeadRotation: -0.3,
    stemLength: 30,
    stemWidth: 2,
    ledgerLineExtension: 18,

    clefFont: "110px serif",
    titleFont: "16px sans-serif",
    restFont: "36px serif",
    tripletFont: "14px sans-serif",
    accidentalFont: "14px sans-serif",

    primaryColor: "white",
    wrongPitchColor: "#eab308",
    correctNoteColor: "#4ecb41",
    incorrectNoteColor: "#ef4444",
    playheadColor: "rgba(34, 197, 94, 0.6)",

    trebleBottomLineMidi: 64,
}

export const DEFAULT_PITCH_STAFF_CONFIG: StaffConfig = {
    staffTop: 60,
    lineSpacing: 20,
    leftPad: 40,
    rightPad: 40,

    noteHeadWidth: 9,
    noteHeadHeight: 7,
    noteHeadRotation: -0.3,
    stemLength: 35,
    stemWidth: 2,
    ledgerLineExtension: 22,

    clefFont: "110px serif",
    titleFont: "16px sans-serif",
    restFont: "36px serif",
    tripletFont: "14px sans-serif",
    accidentalFont: "16px sans-serif",

    primaryColor: "white",
    wrongPitchColor: "white",
    correctNoteColor: "white",
    incorrectNoteColor: "white",
    playheadColor: "white",

    trebleBottomLineMidi: 64,
}

export class StaffRenderer {
    private ctx: CanvasRenderingContext2D
    private config: StaffConfig
    private canvas: HTMLCanvasElement

    constructor(canvas: HTMLCanvasElement, config: Partial<StaffConfig> = {}) {
        this.canvas = canvas
        this.ctx = canvas.getContext("2d")!
        this.config = { ...DEFAULT_PHRASE_STAFF_CONFIG, ...config }
    }

    /**
     * Get color for a note based on correctness
     */
    private getNoteColor(tick: number, noteResults?: Array<{ tick: number; passed: boolean }>): string {
        if (!noteResults) return this.config.primaryColor
        const result = noteResults.find(r => r.tick === tick)
        if (!result) return this.config.primaryColor
        return result.passed ? this.config.correctNoteColor : this.config.incorrectNoteColor
    }

    /**
     * Apply SCALE multiplier to configuration dimensions
     */
    private getScaledConfig(): StaffConfig {
        return {
            ...this.config,
            staffTop: this.config.staffTop * SCALE,
            lineSpacing: this.config.lineSpacing * SCALE,
            leftPad: this.config.leftPad * SCALE,
            rightPad: this.config.rightPad * SCALE,
            clefPad: (this.config.clefPad ?? 0) * SCALE,
            afterClefPad: (this.config.afterClefPad ?? 0) * SCALE,
            noteHeadWidth: this.config.noteHeadWidth * SCALE,
            noteHeadHeight: this.config.noteHeadHeight * SCALE,
            stemLength: this.config.stemLength * SCALE,
            stemWidth: this.config.stemWidth * SCALE,
            ledgerLineExtension: this.config.ledgerLineExtension * SCALE,
            clefFont: this.scaleFont(this.config.clefFont),
            titleFont: this.scaleFont(this.config.titleFont),
            restFont: this.scaleFont(this.config.restFont),
            tripletFont: this.scaleFont(this.config.tripletFont),
            accidentalFont: this.scaleFont(this.config.accidentalFont),
        }
    }

    /**
     * Scale font size by SCALE multiplier
     */
    private scaleFont(fontStr: string): string {
        return fontStr.replace(/(\d+)px/, (match, size) => {
            return `${Math.round(parseInt(size) * SCALE)}px`
        })
    }

    /**
     * Convert staff step to Y coordinate
     */
    private stepToY(step: number, staffTop: number, lineSpacing: number): number {
        const bottomLineStep = midiToDiatonicStep(this.config.trebleBottomLineMidi)
        return calculateStepY(step, bottomLineStep, staffTop, lineSpacing)
    }

    /**
     * Calculate how measures should be distributed across multiple lines
     */
    private calculateLineLayout(score: Score, measureTicks: number): LineLayout[] {
        // Measures per line is inversely proportional to scale
        // At scale 1.0: 2 measures per 800px
        // At scale 0.5: 4 measures per 800px (smaller rendering, more fits)
        // At scale 2.0: 1 measure per 800px (larger rendering, less fits)
        let measuresPerLine = Math.max(1, Math.floor((BASE_MEASURES_PER_800PX / SCALE) * (this.canvas.width / 800)))

        // Use scaled spacing for consistent layout calculations
        const scaledLineSpacing = this.config.lineSpacing * SCALE
        const scaledLineGap = LINE_GAP * SCALE
        const staffHeight = 4 * scaledLineSpacing  // Height of 5-line staff
        const lineHeight = staffHeight + scaledLineGap

        const lines: LineLayout[] = []
        let currentMeasureIndex = 0
        let lineNumber = 0

        while (currentMeasureIndex < score.measures.length) {
            const endMeasureIndex = Math.min(
                currentMeasureIndex + measuresPerLine - 1,
                score.measures.length - 1
            )

            lines.push({
                lineNumber,
                startMeasureIndex: currentMeasureIndex,
                endMeasureIndex,
                yOffset: lineNumber * lineHeight
            })

            currentMeasureIndex = endMeasureIndex + 1
            lineNumber++
        }

        return lines
    }

    /**
     * Render the full musical score
     */
    render(state: RenderState): void {
        // Apply SCALE multiplier to all config dimensions
        const config = this.getScaledConfig()
        const scaledLineGap = LINE_GAP * SCALE

        const measureTicks = config.measureTicks ?? (TICKS_PER_QUARTER * 4)
        const lineLayouts = this.calculateLineLayout(state.score, measureTicks)

        // Calculate new canvas height dynamically
        const titleHeight = state.title ? TITLE_HEIGHT : 0
        const staffHeight = 4 * config.lineSpacing
        const lineHeight = staffHeight + scaledLineGap
        const newHeight = titleHeight + config.staffTop + lineLayouts.length * lineHeight + CANVAS_BOTTOM_PADDING
        this.canvas.height = newHeight

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

        // 1. Draw title only once
        if (state.title) {
            drawTitle(this.ctx, state.title, config)
        }

        // Calculate vertical offset to account for title and top padding
        const initialYOffset = titleHeight

        // 2. For each line
        for (const lineLayout of lineLayouts) {
            const measuresOnLine = lineLayout.endMeasureIndex - lineLayout.startMeasureIndex + 1
            const totalTicksOnLine = measuresOnLine * measureTicks

            // Calculate layout for this line's measures
            const usableW = this.canvas.width - config.leftPad - config.rightPad -
                (config.clefPad ?? 0) - (config.afterClefPad ?? 0)
            const x0 = config.leftPad + (config.clefPad ?? 0) + (config.afterClefPad ?? 0)
            const tickW = usableW / totalTicksOnLine

            // Adjust yOffset to account for title and initial padding
            const adjustedYOffset = initialYOffset + lineLayout.yOffset

            // Draw staff lines at the correct y position
            drawStaffLines(this.ctx, config, this.canvas.width, adjustedYOffset)

            // Draw clef only on first line
            if (lineLayout.lineNumber === 0) {
                drawClef(this.ctx, config, adjustedYOffset)
            }

            // Draw bar lines at the end of each measure
            const firstMeasure = lineLayout.startMeasureIndex
            const lastMeasure = lineLayout.endMeasureIndex
            const barlineTopY = config.staffTop + adjustedYOffset
            const barlineBottomY = config.staffTop + adjustedYOffset + 4 * config.lineSpacing

            for (let b = firstMeasure; b < lastMeasure; b++) {
                const x = x0 + (b - firstMeasure + 1) * measureTicks * tickW
                this.ctx.strokeStyle = config.primaryColor
                this.ctx.lineWidth = 2
                this.ctx.beginPath()
                this.ctx.moveTo(x, barlineTopY)
                this.ctx.lineTo(x, barlineBottomY)
                this.ctx.stroke()
            }

            // Draw final barline at the end of the last measure on this line
            const endX = x0 + (lastMeasure - firstMeasure + 1) * measureTicks * tickW
            this.ctx.strokeStyle = config.primaryColor
            this.ctx.lineWidth = 2
            this.ctx.beginPath()
            this.ctx.moveTo(endX, barlineTopY)
            this.ctx.lineTo(endX, barlineBottomY)
            this.ctx.stroke()

            // Draw double barline at the very end of the score
            if (lineLayout.lineNumber === lineLayouts.length - 1) {
                const doubleLineGap = 4
                this.ctx.strokeStyle = config.primaryColor
                this.ctx.lineWidth = 2

                // First line of double barline
                this.ctx.beginPath()
                this.ctx.moveTo(endX - doubleLineGap, barlineTopY)
                this.ctx.lineTo(endX - doubleLineGap, barlineBottomY)
                this.ctx.stroke()

                // Second line of double barline
                this.ctx.beginPath()
                this.ctx.moveTo(endX, barlineTopY)
                this.ctx.lineTo(endX, barlineBottomY)
                this.ctx.stroke()
            }

            // Calculate all note positions for the measures on this line
            const measuresForLine = state.score.measures.slice(lineLayout.startMeasureIndex, lineLayout.endMeasureIndex + 1)
            const scoreForLine: Score = { measures: measuresForLine }
            const allItems = calculateNotePositions(scoreForLine, config, this.canvas.width, x0, tickW, adjustedYOffset)

            // 5. Draw rests and notes
            const trebleBottomLineStep = midiToDiatonicStep(config.trebleBottomLineMidi)
            const staffBottomStep = trebleBottomLineStep
            const staffTopStep = trebleBottomLineStep + 8

            for (const item of allItems) {
                if (item.event.kind === "rest") {
                    const restBaselineY = adjustedYOffset + 2.5 * config.lineSpacing
                    drawRest(this.ctx, item.x, item.durTicks, restBaselineY, config)
                } else {
                    const midi = pitchToMidi(item.event.pitch)
                    const step = midiToDiatonicStep(midi)
                    const y = this.stepToY(step, config.staffTop, config.lineSpacing) + adjustedYOffset
                    const noteColor = this.getNoteColor(item.tick, state.noteResults)

                    drawLedgerLines(
                        this.ctx, item.x, step,
                        staffBottomStep, staffTopStep,
                        (s) => this.stepToY(s, config.staffTop, config.lineSpacing) + adjustedYOffset,
                        noteColor, config
                    )

                    drawNoteHead(this.ctx, item.x, y, item.durTicks, noteColor, config)

                    const acc = getAccidentalFromPitch(item.event.pitch)
                    if (acc) {
                        drawAccidental(this.ctx, acc, item.x, y, noteColor, config)
                    }

                    const { stemX, stemTopY } = drawStem(this.ctx, item.x, y, noteColor, config)
                    item.y = y
                    item.stemX = stemX
                    item.stemTopY = stemTopY
                    item.isTriplet = item.event.dur === "8t"

                    if (item.event.dur === "q." || item.event.dur === "8." || item.event.dur === "h.") {
                        drawDot(this.ctx, item.x, y, noteColor)
                    }
                }
            }

            // 6. Draw beams for eighth notes
            const beamGroups = calculateEighthOnlyBeamGroups(allItems, measureTicks)
            for (const g of beamGroups) {
                for (const n of g) n.isBeamed = true
            }
            for (const g of beamGroups) {
                const beamColor = this.getNoteColor(g[0].tick, state.noteResults)
                drawBeam(this.ctx, g, beamColor, config)
            }

            // 6.5. Draw double beams for sixteenth notes
            const mixedBeamGroups = calculateMixedBeamGroups(allItems, measureTicks)
            for (const g of mixedBeamGroups.primary) {
                for (const n of g) n.isBeamed = true
            }
            for (let i = 0; i < mixedBeamGroups.primary.length; i++) {
                const primaryGroup = mixedBeamGroups.primary[i]
                const beamColor = this.getNoteColor(primaryGroup[0].tick, state.noteResults)

                const relevantSecondaryGroups = mixedBeamGroups.secondary.filter(secGroup => {
                    return secGroup.every(note => primaryGroup.includes(note))
                })

                if (relevantSecondaryGroups.length > 0) {
                    for (const secGroup of relevantSecondaryGroups) {
                        drawMixedBeam(this.ctx, primaryGroup, secGroup, beamColor, config)
                    }
                } else {
                    drawBeam(this.ctx, primaryGroup, beamColor, config)
                }

                for (let j = 0; j < primaryGroup.length; j++) {
                    const note = primaryGroup[j]
                    if (note.event.dur === "16") {
                        const isInSecondaryGroup = relevantSecondaryGroups.some(sg => sg.includes(note))

                        if (!isInSecondaryGroup) {
                            const direction = j === 0 ? "right" : "left"
                            drawPartialSecondaryBeam(this.ctx, note, direction, beamColor, config)
                        }
                    }
                }
            }

            // 7. Draw triplet beams and brackets
            const tripletGroups = calculateTripletGroups(allItems, measureTicks)
            for (const group of tripletGroups) {
                const notes = group.filter((it: DrawItem) => it.event.kind === "note")

                if (notes.length >= 2) {
                    const beamColor = this.getNoteColor(notes[0].tick, state.noteResults)
                    drawBeam(this.ctx, notes, beamColor, config)
                    for (const note of notes) note.isBeamed = true
                }

                drawTripletBracket(this.ctx, group, notes, adjustedYOffset, config)
            }

            // 8. Draw flags for unbeamed eighth notes
            for (const it of allItems) {
                if (
                    it.event.kind === "note" &&
                    !it.isBeamed &&
                    it.stemX !== undefined &&
                    it.stemTopY !== undefined
                ) {
                    if (it.event.dur === "8" || it.event.dur === "8t") {
                        const flagColor = this.getNoteColor(it.tick, state.noteResults)
                        drawFlag(this.ctx, it.stemX, it.stemTopY, flagColor)
                    } else if (it.event.dur === "16") {
                        const flagColor = this.getNoteColor(it.tick, state.noteResults)
                        drawSixteenthFlag(this.ctx, it.stemX, it.stemTopY, flagColor)
                    }
                }
            }

            // 9. Draw ties
            for (const it of allItems) {
                if (it.event.kind === "note" && (it.event as NoteEvent).tiedTo) {
                    const nextMeasureIdx = it.eventIndex === state.score.measures[it.measureIndex + lineLayout.startMeasureIndex].events.length - 1
                        ? it.measureIndex + 1
                        : it.measureIndex
                    const nextEventIdx = it.eventIndex === state.score.measures[it.measureIndex + lineLayout.startMeasureIndex].events.length - 1
                        ? 0
                        : it.eventIndex + 1

                    const nextItem = allItems.find(
                        (item: DrawItem) => item.measureIndex === nextMeasureIdx && item.eventIndex === nextEventIdx
                    )

                    if (nextItem && it.y !== undefined && nextItem.y !== undefined) {
                        const tieColor = this.getNoteColor(it.tick, state.noteResults)
                        drawTie(this.ctx, it.x + 8, nextItem.x - 8, it.y, tieColor)
                    }
                }
            }

            // 10. Draw playhead only on the line that contains it
            if (state.currentTime !== undefined && state.tempo !== undefined) {
                const totalTicks = state.score.measures.length * measureTicks
                const playheadX = calculatePlayheadX(
                    state.currentTime,
                    state.tempo,
                    totalTicks,
                    config,
                    this.canvas.width
                )

                // Check if playhead is on this line
                const lineStartX = x0
                const lineEndX = x0 + (lineLayout.endMeasureIndex - lineLayout.startMeasureIndex + 1) * measureTicks * tickW

                if (playheadX >= lineStartX && playheadX <= lineEndX) {
                    drawPlayhead(this.ctx, playheadX, config, adjustedYOffset)
                }
            }
        }
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<StaffConfig>): void {
        this.config = { ...this.config, ...newConfig }
    }

    /**
     * Get current configuration
     */
    getConfig(): Readonly<StaffConfig> {
        return { ...this.config }
    }
}

export type {
    StaffConfig,
    CanvasSizing,
    ClefType,
    MusicalConfig,
    DrawItem,
    RenderState,
    NoteColor
} from "./types"

export {
    midiToDiatonicStep,
    pitchToMidi,
    getAccidentalFromPitch,
    getAccidentalFromMidi
} from "./music"

export {
    calculateNotePositions,
    calculateEighthOnlyBeamGroups,
    calculateMixedBeamGroups,
    calculateTripletGroups,
    calculatePlayheadX
} from "./layout"

export {
    drawNoteHead,
    drawStem,
    drawLedgerLines,
    drawAccidental,
    drawDot,
    drawRest,
    drawBeam,
    drawDoubleBeam,
    drawSixteenthFlag,
    drawFlag,
    drawTie,
    drawTripletBracket,
    drawStaffLines,
    drawClef,
    drawBarLines,
    drawTitle,
    drawPlayhead
} from "./drawing"
