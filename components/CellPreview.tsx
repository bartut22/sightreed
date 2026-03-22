import { useEffect, useRef } from "react"
import { Cell } from "../lib/cellLibrary"
import { StaffRenderer } from "../lib/staffRenderer/main"
import { cellToScore } from "../lib/cellScore"

export type CellPreviewProps = {
    cell: Cell
    width?: number
    height?: number
    compact?: boolean
}

export function CellPreview({
    cell,
    width = 320,
    height = 120,
    compact = false,
}: CellPreviewProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    useEffect(() => {
        if (!canvasRef.current) return

        const renderer = new StaffRenderer(canvasRef.current, {
            staffTop: 40,
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
        },
        // {
        //     canvasWidth: width,
        //     canvasHeight: height,
        //     staffTop: compact ? 40 : 50,
        //     lineSpacing: compact ? 14 : 18,
        //     leftPad: 20,
        //     rightPad: 20,
        //     clefPad: 30,
        //     afterClefPad: 12,
        // }
        )

        renderer.render({
            score: cellToScore(cell),
        })
    }, [cell, width, height, compact])

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ display: "block" }}
        />
    )
}
