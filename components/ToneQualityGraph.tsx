"use client"

import { useEffect, useRef } from "react"
import type { TickState } from "@/lib/performanceTracker"

type Props = {
    stateHistory: TickState[]
    tempo: number
}

export default function ToneQualityGraph({ stateHistory, tempo }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const prevLengthRef = useRef<number>(0)
    
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        
        if (stateHistory.length > 0 && stateHistory.length == prevLengthRef.current)
            return // No change
        prevLengthRef.current = stateHistory.length
        // console.log('🎨 ToneQualityGraph UPDATE:', stateHistory.length, 'states')
        
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const width = canvas.width
        const height = canvas.height

        // Clear canvas
        ctx.fillStyle = "#0a0a0a"
        ctx.fillRect(0, 0, width, height)

        // Filter to only states with spectral data
        const noteStates = stateHistory.filter(
            s => s.centroid !== undefined &&
                s.hnr !== undefined &&
                s.centroid > 0 &&
                s.hnr > -50 && // Allow negative dB values
                s.actualPitch !== null
        )

        console.log(`Tone Quality Graph: ${noteStates.length} states with spectral data out of ${stateHistory.length} total`)

        if (noteStates.length === 0) {
            ctx.fillStyle = "#666"
            ctx.font = "14px sans-serif"
            ctx.textAlign = "center"
            ctx.fillText("Play some notes to see tone quality data", width / 2, height / 2)
            return
        }

        const PADDING = 60
        const GRAPH_HEIGHT = height - PADDING * 6
        const GRAPH_WIDTH = width - PADDING * 3

        const minTick = Math.min(...noteStates.map(s => s.rawTick))
        const maxTick = Math.max(...noteStates.map(s => s.rawTick))
        const tickRange = maxTick - minTick || 1

        // ✅ UPDATED RANGES for dB scale
        const HNR_MIN = -10
        const HNR_MAX = 40

        const CENTROID_MAX = 3000

        const tickToX = (tick: number) => {
            return PADDING + ((tick - minTick) / tickRange) * GRAPH_WIDTH
        }

        // === DRAW HNR GRAPH (top half) ===
        const hnrY = PADDING

        ctx.fillStyle = "#1a1a1a"
        ctx.fillRect(PADDING, hnrY, GRAPH_WIDTH, GRAPH_HEIGHT)

        // Grid lines
        ctx.strokeStyle = "#333"
        ctx.lineWidth = 1
        for (let i = 0; i <= 4; i++) {
            const y = hnrY + (i / 4) * GRAPH_HEIGHT
            ctx.beginPath()
            ctx.moveTo(PADDING, y)
            ctx.lineTo(PADDING + GRAPH_WIDTH, y)
            ctx.stroke()
        }

        // Y-axis labels for HNR (in dB)
        ctx.fillStyle = "#888"
        ctx.font = "11px sans-serif"
        ctx.textAlign = "right"
        for (let i = 0; i <= 4; i++) {
            const value = HNR_MAX - (i / 4) * (HNR_MAX - HNR_MIN)
            const y = hnrY + (i / 4) * GRAPH_HEIGHT
            ctx.fillText(`${value.toFixed(0)} dB`, PADDING - 5, y + 4)
        }

        // Draw HNR line
        ctx.strokeStyle = "#3b82f6"
        ctx.lineWidth = 2
        ctx.beginPath()
        noteStates.forEach((state, i) => {
            const x = tickToX(state.rawTick)
            const hnrNormalized = Math.max(0, Math.min(1, (state.hnr! - HNR_MIN) / (HNR_MAX - HNR_MIN)))
            const y = hnrY + GRAPH_HEIGHT - (hnrNormalized * GRAPH_HEIGHT)
            // console.log('HNR State:', state, '->', { x, y })

            if (i === 0) {
                ctx.moveTo(x, y)
            } else {
                ctx.lineTo(x, y)
            }
        })
        ctx.stroke()

        // ✅ Draw HNR scatter points
        ctx.fillStyle = "#3b82f6"
        noteStates.forEach((state) => {
            const x = tickToX(state.rawTick)
            const hnrNormalized = Math.max(0, Math.min(1, (state.hnr! - HNR_MIN) / (HNR_MAX - HNR_MIN)))
            const y = hnrY + GRAPH_HEIGHT - (hnrNormalized * GRAPH_HEIGHT)

            ctx.beginPath()
            ctx.arc(x, y, 2, 0, Math.PI * 2)
            ctx.fill()
        })

        ctx.fillStyle = "#3b82f6"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "left"
        ctx.fillText("HNR - Harmonic-to-Noise Ratio (dB)", PADDING, hnrY - 8)

        // === DRAW CENTROID GRAPH (bottom half) ===
        const centroidY = hnrY + GRAPH_HEIGHT + PADDING

        ctx.fillStyle = "#1a1a1a"
        ctx.fillRect(PADDING, centroidY, GRAPH_WIDTH, GRAPH_HEIGHT)

        ctx.strokeStyle = "#333"
        ctx.lineWidth = 1
        for (let i = 0; i <= 4; i++) {
            const y = centroidY + (i / 4) * GRAPH_HEIGHT
            ctx.beginPath()
            ctx.moveTo(PADDING, y)
            ctx.lineTo(PADDING + GRAPH_WIDTH, y)
            ctx.stroke()
        }

        ctx.fillStyle = "#888"
        ctx.font = "11px sans-serif"
        ctx.textAlign = "right"
        for (let i = 0; i <= 4; i++) {
            const value = CENTROID_MAX - (i / 4) * CENTROID_MAX
            const y = centroidY + (i / 4) * GRAPH_HEIGHT
            ctx.fillText(value.toFixed(0), PADDING - 5, y + 4)
        }

        // Draw Centroid line
        ctx.strokeStyle = "#22c55e"
        ctx.lineWidth = 2
        ctx.beginPath()
        noteStates.forEach((state, i) => {
            const x = tickToX(state.rawTick)
            const centroidNormalized = Math.min(state.centroid! / CENTROID_MAX, 1)
            const y = centroidY + GRAPH_HEIGHT - (centroidNormalized * GRAPH_HEIGHT)

            if (i === 0) {
                ctx.moveTo(x, y)
            } else {
                ctx.lineTo(x, y)
            }
        })
        ctx.stroke()

        // ✅ Draw Centroid scatter points
        ctx.fillStyle = "#22c55e"
        noteStates.forEach((state) => {
            const x = tickToX(state.rawTick)
            const centroidNormalized = Math.min(state.centroid! / CENTROID_MAX, 1)
            const y = centroidY + GRAPH_HEIGHT - (centroidNormalized * GRAPH_HEIGHT)

            ctx.beginPath()
            ctx.arc(x, y, 2, 0, Math.PI * 2)
            ctx.fill()
        })

        ctx.fillStyle = "#22c55e"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "left"
        ctx.fillText("Spectral Centroid (Brightness - Hz)", PADDING, centroidY - 8)

        // === TIME AXIS ===
        const msPerTick = (60000 / tempo) / 48
        const totalSeconds = (tickRange * msPerTick) / 1000

        ctx.fillStyle = "#888"
        ctx.font = "11px sans-serif"
        ctx.textAlign = "center"

        const numLabels = Math.min(10, Math.ceil(totalSeconds))
        // console.log('Time Axis:', { totalSeconds, numLabels, minTick, maxTick, tickRange })
        for (let i = 0; i <= numLabels; i++) {
            const timeSec = (i / numLabels) * totalSeconds
            const tick = minTick + (i / numLabels) * tickRange
            const x = tickToX(tick)
            ctx.fillText(`${timeSec.toFixed(1)}s`, x, height - 10)
        }

        // === AVERAGE LINES ===
        const avgHNR = noteStates.reduce((sum, s) => sum + s.hnr!, 0) / noteStates.length
        const avgCentroid = noteStates.reduce((sum, s) => sum + s.centroid!, 0) / noteStates.length

        ctx.strokeStyle = "#60a5fa"
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        const avgHNRNormalized = Math.max(0, Math.min(1, (avgHNR - HNR_MIN) / (HNR_MAX - HNR_MIN)))
        const avgHNRY = hnrY + GRAPH_HEIGHT - (avgHNRNormalized * GRAPH_HEIGHT)
        ctx.beginPath()
        ctx.moveTo(PADDING, avgHNRY)
        ctx.lineTo(PADDING + GRAPH_WIDTH, avgHNRY)
        ctx.stroke()

        ctx.fillStyle = "#60a5fa"
        ctx.textAlign = "left"
        ctx.fillText(`Avg: ${avgHNR.toFixed(1)} dB`, PADDING + GRAPH_WIDTH + 5, avgHNRY + 4)

        ctx.strokeStyle = "#4ade80"
        const avgCentroidY = centroidY + GRAPH_HEIGHT - ((avgCentroid / CENTROID_MAX) * GRAPH_HEIGHT)
        ctx.beginPath()
        ctx.moveTo(PADDING, avgCentroidY)
        ctx.lineTo(PADDING + GRAPH_WIDTH, avgCentroidY)
        ctx.stroke()

        ctx.fillStyle = "#4ade80"
        ctx.fillText(`Avg: ${avgCentroid.toFixed(0)} Hz`, PADDING + GRAPH_WIDTH + 5, avgCentroidY + 4)

        ctx.setLineDash([])

    }, [stateHistory, tempo])

    return (
        <div style={{ marginTop: 24 }}>
            <h3 style={{ marginBottom: 12, fontSize: 16 }}>Tone Quality Analysis</h3>
            <canvas
                ref={canvasRef}
                width={900}
                height={500}
                style={{
                    width: "100%",
                    height: "auto",
                    background: "#0a0a0a",
                    borderRadius: 8,
                    border: "1px solid #333"
                }}
            />
            <div style={{ marginTop: 12, fontSize: 13, color: "#888", display: "flex", gap: 24 }}>
                <div>
                    <span style={{ color: "#3b82f6", fontWeight: 600 }}>● HNR:</span> Higher dB = cleaner, more harmonic tone
                </div>
                <div>
                    <span style={{ color: "#22c55e", fontWeight: 600 }}>● Centroid:</span> Consistency = stable embouchure
                </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
                Typical HNR: Pure tones 30-40dB • Wind instruments 15-30dB • Breathy/noisy 5-15dB
            </div>
        </div>
    )
}
