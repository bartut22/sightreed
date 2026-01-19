import { StaffConfig, RenderState, DrawItem } from "./types"
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
import { TICKS_PER_QUARTER, NoteEvent } from "../notation"

export const DEFAULT_PHRASE_STAFF_CONFIG: StaffConfig = {
    staffTop: 160,
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
    correctNoteColor: "#22c55e",
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
     * Convert staff step to Y coordinate
     */
    private stepToY(step: number): number {
        const bottomLineStep = midiToDiatonicStep(this.config.trebleBottomLineMidi)
        return calculateStepY(step, bottomLineStep, this.config.staffTop, this.config.lineSpacing)
    }

    /**
     * Render the full musical score
     */
    render(state: RenderState): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

        const measureTicks = this.config.measureTicks ?? (TICKS_PER_QUARTER * 4)
        const totalTicks = state.score.measures.length * measureTicks

        // 1. Draw title
        if (state.title) {
            drawTitle(this.ctx, state.title, this.config)
        }

        // 2. Draw staff lines
        drawStaffLines(this.ctx, this.config, this.canvas.width)

        // 3. Draw clef
        drawClef(this.ctx, this.config)

        // Calculate layout
        const usableW = this.canvas.width - this.config.leftPad - this.config.rightPad -
            (this.config.clefPad ?? 0) - (this.config.afterClefPad ?? 0)
        const x0 = this.config.leftPad + (this.config.clefPad ?? 0) + (this.config.afterClefPad ?? 0)
        const tickW = usableW / totalTicks

        // 4. Draw bar lines
        drawBarLines(this.ctx, state.score.measures.length, measureTicks, x0, tickW, this.config)

        // 5. Calculate all note positions
        const allItems = calculateNotePositions(state.score, this.config, this.canvas.width)

        // 6. Draw rests and notes
        const trebleBottomLineStep = midiToDiatonicStep(this.config.trebleBottomLineMidi)
        const staffBottomStep = trebleBottomLineStep
        const staffTopStep = trebleBottomLineStep + 8

        for (const item of allItems) {
            if (item.event.kind === "rest") {
                const restBaselineY = this.config.staffTop + 2.5 * this.config.lineSpacing
                drawRest(this.ctx, item.x, item.durTicks, restBaselineY, this.config)
            } else {
                const midi = pitchToMidi(item.event.pitch)
                const step = midiToDiatonicStep(midi)
                const y = this.stepToY(step)
                const noteColor = this.getNoteColor(item.tick, state.noteResults)

                // Ledger lines
                drawLedgerLines(
                    this.ctx, item.x, step,
                    staffBottomStep, staffTopStep,
                    (s) => this.stepToY(s),
                    noteColor, this.config
                )

                // Note head
                drawNoteHead(this.ctx, item.x, y, item.durTicks, noteColor, this.config)

                // Accidental
                const acc = getAccidentalFromPitch(item.event.pitch)
                if (acc) {
                    drawAccidental(this.ctx, acc, item.x, y, noteColor, this.config)
                }

                // Stem
                const { stemX, stemTopY } = drawStem(this.ctx, item.x, y, noteColor, this.config)
                item.y = y
                item.stemX = stemX
                item.stemTopY = stemTopY
                item.isTriplet = item.event.dur === "8t"

                // Dot
                if (item.event.dur === "q." || item.event.dur === "8." || item.event.dur === "h.") {
                    drawDot(this.ctx, item.x, y, noteColor)
                }
            }
        }

        // 7. Draw beams for eighth notes
        const beamGroups = calculateEighthOnlyBeamGroups(allItems, measureTicks)
        for (const g of beamGroups) {
            for (const n of g) n.isBeamed = true
        }
        for (const g of beamGroups) {
            const beamColor = this.getNoteColor(g[0].tick, state.noteResults)
            drawBeam(this.ctx, g, beamColor, this.config)
        }

        // 7.5. Draw double beams for sixteenth notes
        const mixedBeamGroups = calculateMixedBeamGroups(allItems, measureTicks)
        for (const g of mixedBeamGroups.primary) {
            for (const n of g) n.isBeamed = true
        }
        // Draw primary beams for all notes, secondary beams for sixteenth subgroups
        for (let i = 0; i < mixedBeamGroups.primary.length; i++) {
            const primaryGroup = mixedBeamGroups.primary[i]
            const beamColor = this.getNoteColor(primaryGroup[0].tick, state.noteResults)

            // Find which secondary groups belong to this primary group
            const relevantSecondaryGroups = mixedBeamGroups.secondary.filter(secGroup => {
                return secGroup.every(note => primaryGroup.includes(note))
            })

            if (relevantSecondaryGroups.length > 0) {
                // Draw mixed beam with secondary beams for sixteenths
                for (const secGroup of relevantSecondaryGroups) {
                    drawMixedBeam(this.ctx, primaryGroup, secGroup, beamColor, this.config)
                }
            } else {
                // No sixteenths, just primary beam
                drawBeam(this.ctx, primaryGroup, beamColor, this.config)
            }

            // Draw partial beams for isolated sixteenths in mixed groups
            for (let j = 0; j < primaryGroup.length; j++) {
                const note = primaryGroup[j]
                if (note.event.dur === "16") {
                    // Check if this sixteenth is part of a secondary group
                    const isInSecondaryGroup = relevantSecondaryGroups.some(sg => sg.includes(note))

                    if (!isInSecondaryGroup) {
                        // Isolated sixteenth - draw partial beam
                        const direction = j === 0 ? "right" : "left"
                        drawPartialSecondaryBeam(this.ctx, note, direction, beamColor, this.config)
                    }
                }
            }
        }

        // 8. Draw triplet beams and brackets
        const tripletGroups = calculateTripletGroups(allItems, measureTicks)
        for (const group of tripletGroups) {
            const notes = group.filter((it: DrawItem) => it.event.kind === "note")

            if (notes.length >= 2) {
                const beamColor = this.getNoteColor(notes[0].tick, state.noteResults)
                drawBeam(this.ctx, notes, beamColor, this.config)
                for (const note of notes) note.isBeamed = true
            }

            drawTripletBracket(this.ctx, group, notes, this.config.staffTop, this.config)
        }

        // 9. Draw flags for unbeamed eighth notes
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

        // 10. Draw ties
        for (const it of allItems) {
            if (it.event.kind === "note" && (it.event as NoteEvent).tiedTo) {
                const nextMeasureIdx = it.eventIndex === state.score.measures[it.measureIndex].events.length - 1
                    ? it.measureIndex + 1
                    : it.measureIndex
                const nextEventIdx = it.eventIndex === state.score.measures[it.measureIndex].events.length - 1
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

        // 11. Draw playhead (if playing)
        if (state.currentTime !== undefined && state.tempo !== undefined) {
            const playheadX = calculatePlayheadX(
                state.currentTime,
                state.tempo,
                totalTicks,
                this.config,
                this.canvas.width
            )

            if (playheadX >= x0 && playheadX <= this.canvas.width - this.config.rightPad) {
                drawPlayhead(this.ctx, playheadX, this.config)
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
    TimeSignature,
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
