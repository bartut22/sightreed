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
  const rendererRef = useRef<StaffRenderer | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    rendererRef.current = new StaffRenderer(canvasRef.current, DEFAULT_PHRASE_STAFF_CONFIG)
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
    
    rendererRef.current.render(state)
  }, [score, title, currentTime, tempo, noteResults])

  return <canvas ref={canvasRef} width={800} height={300} className="w-full" />
}
