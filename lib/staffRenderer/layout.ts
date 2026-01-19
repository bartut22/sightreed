import { Score, durToTicks, TICKS_PER_QUARTER } from "../notation"
import { StaffConfig, DrawItem } from "./types"

/**
 * Calculate X positions for all notes based on tick timing
 */
export function calculateNotePositions(
  score: Score,
  config: StaffConfig,
  canvasWidth: number
): DrawItem[] {
  const measureTicks = config.measureTicks ?? (TICKS_PER_QUARTER * 4)
  const totalTicks = score.measures.length * measureTicks
  
  const usableW = canvasWidth - config.leftPad - config.rightPad - 
                  (config.clefPad ?? 0) - (config.afterClefPad ?? 0)
  const x0 = config.leftPad + (config.clefPad ?? 0) + (config.afterClefPad ?? 0)
  const tickW = usableW / totalTicks

  let globalTick = 0
  const allItems: DrawItem[] = []

  for (let mi = 0; mi < score.measures.length; mi++) {
    const measure = score.measures[mi]
    let localTick = 0

    for (let ei = 0; ei < measure.events.length; ei++) {
      const e = measure.events[ei]
      const durTicks = durToTicks(e.dur)
      const absoluteTick = mi * measureTicks + localTick
      const x = x0 + (absoluteTick + durTicks / 2) * tickW

      allItems.push({
        event: e,
        x,
        durTicks,
        tick: globalTick + localTick,
        measureIndex: mi,
        eventIndex: ei,
      })

      localTick += durTicks
    }

    globalTick += measureTicks
  }

  return allItems
}

/**
 * Group notes for beaming, handling mixed eighth and sixteenth notes
 * Groups within the same beat: eighths and sixteenths beam together
 */
export function calculateMixedBeamGroups(
  items: DrawItem[],
  measureTicks: number
): { primary: DrawItem[][]; secondary: DrawItem[][] } {
  const primaryGroups: DrawItem[][] = []  // All beamed notes
  const secondaryGroups: DrawItem[][] = []  // Only sixteenths within mixed groups
  let current: DrawItem[] = []

  function flush() {
    if (current.length >= 2) {
      // Check if we have any sixteenths
      const has16ths = current.some(n => n.event.dur === "16")
      const has8ths = current.some(n => n.event.dur === "8")
      
      // Only beam if:
      // 1. All sixteenths (will get double beam)
      // 2. Mixed 8ths and 16ths (primary beam for all, secondary for 16ths only)
      // Skip pure eighth note pairs (handled separately)
      
      if (has16ths) {
        primaryGroups.push([...current])
        
        // Create secondary beam groups for consecutive sixteenths
        const sixteenthSubgroups: DrawItem[][] = []
        let sixteenthRun: DrawItem[] = []
        
        for (const note of current) {
          if (note.event.dur === "16") {
            sixteenthRun.push(note)
          } else {
            if (sixteenthRun.length >= 2) {
              sixteenthSubgroups.push([...sixteenthRun])
            }
            sixteenthRun = []
          }
        }
        // Flush remaining sixteenths
        if (sixteenthRun.length >= 2) {
          sixteenthSubgroups.push([...sixteenthRun])
        }
        
        secondaryGroups.push(...sixteenthSubgroups)
      }
    }
    current = []
  }

  for (const it of items) {
    const isBeamableNote = it.event.kind === "note" && 
                          (it.event.dur === "8" || it.event.dur === "16") &&
                          !it.isTriplet &&
                          it.stemX !== undefined && 
                          it.stemTopY !== undefined

    if (!isBeamableNote) {
      flush()
      continue
    }

    const beatOfThis = Math.floor((it.tick % measureTicks) / TICKS_PER_QUARTER)
    const beatOfPrev = current.length > 0 
      ? Math.floor((current[0].tick % measureTicks) / TICKS_PER_QUARTER) 
      : beatOfThis

    // New beat - flush current group
    if (beatOfThis !== beatOfPrev) {
      flush()
    }
    
    current.push(it)
  }

  flush()
  return { primary: primaryGroups, secondary: secondaryGroups }
}

/**
 * Group pure eighth notes (no sixteenths in the group)
 */
export function calculateEighthOnlyBeamGroups(
  items: DrawItem[],
  measureTicks: number
): DrawItem[][] {
  const groups: DrawItem[][] = []
  let current: DrawItem[] = []

  function flush() {
    if (current.length === 2) {
      // Only beam if both are pure eighths
      const allEighths = current.every(n => n.event.dur === "8")
      if (allEighths) {
        groups.push([...current])
      }
    }
    current = []
  }

  for (const it of items) {
    const isEighthNote = it.event.kind === "note" && 
                        it.event.dur === "8" &&
                        it.stemX !== undefined && 
                        it.stemTopY !== undefined && 
                        !it.isTriplet

    if (!isEighthNote) {
      flush()
      continue
    }

    const beatOfThis = Math.floor((it.tick % measureTicks) / TICKS_PER_QUARTER)
    const beatOfPrev = current.length > 0 
      ? Math.floor((current[0].tick % measureTicks) / TICKS_PER_QUARTER) 
      : beatOfThis

    if (beatOfThis !== beatOfPrev) flush()
    current.push(it)
    if (current.length === 2) flush()
  }

  flush()
  return groups
}

/**
 * Group triplets together by beat
 */
export function calculateTripletGroups(
  items: DrawItem[],
  measureTicks: number
): DrawItem[][] {
  const tripletGroups: DrawItem[][] = []
  const grouped = new Set<DrawItem>()
  let i = 0

  while (i < items.length) {
    const item = items[i]
    if (item.event.dur === "8t" && !grouped.has(item)) {
      const group: DrawItem[] = [item]
      grouped.add(item)

      const beatStart = Math.floor(item.tick / TICKS_PER_QUARTER) * TICKS_PER_QUARTER
      const beatEnd = beatStart + TICKS_PER_QUARTER

      let j = i + 1
      while (j < items.length) {
        const next = items[j]
        if (
          next.event.dur === "8t" && 
          next.tick < beatEnd && 
          next.measureIndex === item.measureIndex && 
          !grouped.has(next)
        ) {
          group.push(next)
          grouped.add(next)
          j++
        } else {
          break
        }
      }

      tripletGroups.push(group)
      i = j
    } else {
      i++
    }
  }

  return tripletGroups
}

/**
 * Calculate playhead X position from current time
 */
export function calculatePlayheadX(
  currentTime: number,
  tempo: number,
  totalTicks: number,
  config: StaffConfig,
  canvasWidth: number
): number {
  const usableW = canvasWidth - config.leftPad - config.rightPad - 
                  (config.clefPad ?? 0) - (config.afterClefPad ?? 0)
  const x0 = config.leftPad + (config.clefPad ?? 0) + (config.afterClefPad ?? 0)
  const tickW = usableW / totalTicks
  
  const msPerTick = (60000 / tempo) / TICKS_PER_QUARTER
  const pxPerMs = tickW / msPerTick
  
  return x0 + currentTime * pxPerMs
}
