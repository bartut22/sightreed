// components/PhraseStaff.tsx
"use client"

import { useEffect, useRef } from "react"
import { StaffRenderer, DEFAULT_PHRASE_STAFF_CONFIG, RenderState } from "../lib/staffRenderer/main"
import type { Score } from "../lib/notation"

type Props = {
  score: Score
  title?: string
  currentTime: number
  tempo: number
  noteResults?: Array<{ tick: number; passed: boolean }>
}

export default function PhraseStaff({ score, title, currentTime, tempo, noteResults }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<StaffRenderer | null>(null)
  const stateRef = useRef<RenderState | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    rendererRef.current = new StaffRenderer(canvasRef.current, DEFAULT_PHRASE_STAFF_CONFIG)
  }, [])

  // Handle canvas resize to full width
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const updateCanvasWidth = () => {
      const width = container.clientWidth
      if (canvas.width !== width) {
        canvas.width = width
        // Setting canvas.width clears the canvas, so re-render immediately
        if (rendererRef.current && stateRef.current) {
          rendererRef.current.render(stateRef.current)
        }
      }
    }

    // Set initial width
    updateCanvasWidth()

    // Handle resize
    const resizeObserver = new ResizeObserver(updateCanvasWidth)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (!rendererRef.current) return

    const state: RenderState = {
      score,
      title,
      currentTime,
      tempo,
      noteResults,
    }

    stateRef.current = state
    rendererRef.current.render(state)
  }, [score, title, currentTime, tempo, noteResults])

  return <div ref={containerRef} className="w-full overflow-x-hidden"><canvas ref={canvasRef} className="h-auto" /></div>
}

