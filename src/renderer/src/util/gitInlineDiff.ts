import {
  isNoNewlineMarker,
  parseUnifiedDiffLines,
  type ParsedDiffLine
} from './gitDiffLines'

export type InlineSegment = { type: 'equal' | 'change'; text: string }

export type DiffDisplayRow =
  | { kind: 'del'; segments: InlineSegment[] }
  | { kind: 'add'; segments: InlineSegment[] }
  | { kind: 'change'; oldSegments: InlineSegment[]; newSegments: InlineSegment[] }

const diffContent = (line: string): string => line.slice(1)

const allChanged = (text: string): InlineSegment[] =>
  text.length ? [{ type: 'change', text }] : []

const allEqual = (text: string): InlineSegment[] =>
  text.length ? [{ type: 'equal', text }] : []

const mergeSegments = (
  segments: Array<{ type: 'equal' | 'change'; text: string }>
): InlineSegment[] => {
  const merged: InlineSegment[] = []
  for (const seg of segments) {
    if (!seg.text) continue
    const last = merged[merged.length - 1]
    if (last && last.type === seg.type) {
      last.text += seg.text
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}

/** Character-level diff: highlight only differing spans on each side. */
export const diffStringPair = (
  oldStr: string,
  newStr: string
): { oldSegments: InlineSegment[]; newSegments: InlineSegment[] } => {
  if (oldStr === newStr) {
    return { oldSegments: allEqual(oldStr), newSegments: allEqual(newStr) }
  }
  if (!oldStr) {
    return { oldSegments: [], newSegments: allChanged(newStr) }
  }
  if (!newStr) {
    return { oldSegments: allChanged(oldStr), newSegments: [] }
  }

  const m = oldStr.length
  const n = newStr.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldStr[i - 1] === newStr[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const oldParts: InlineSegment[] = []
  const newParts: InlineSegment[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldStr[i - 1] === newStr[j - 1]) {
      oldParts.unshift({ type: 'equal', text: oldStr[i - 1] })
      newParts.unshift({ type: 'equal', text: newStr[j - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      newParts.unshift({ type: 'change', text: newStr[j - 1] })
      j--
    } else {
      oldParts.unshift({ type: 'change', text: oldStr[i - 1] })
      i--
    }
  }

  return {
    oldSegments: mergeSegments(oldParts),
    newSegments: mergeSegments(newParts)
  }
}

const pairDelAddBlocks = (lines: ParsedDiffLine[]): DiffDisplayRow[] => {
  const rows: DiffDisplayRow[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (line.kind === 'del') {
      const dels: string[] = []
      while (index < lines.length && lines[index].kind === 'del') {
        dels.push(diffContent(lines[index].text))
        index++
      }
      const adds: string[] = []
      while (index < lines.length && lines[index].kind === 'add') {
        adds.push(diffContent(lines[index].text))
        index++
      }
      const count = Math.max(dels.length, adds.length)
      for (let k = 0; k < count; k++) {
        const oldText = dels[k]
        const newText = adds[k]
        if (oldText !== undefined && newText !== undefined) {
          const { oldSegments, newSegments } = diffStringPair(oldText, newText)
          rows.push({ kind: 'change', oldSegments, newSegments })
        } else if (oldText !== undefined) {
          rows.push({ kind: 'del', segments: allChanged(oldText) })
        } else if (newText !== undefined) {
          rows.push({ kind: 'add', segments: allChanged(newText) })
        }
      }
      continue
    }
    if (line.kind === 'add') {
      rows.push({ kind: 'add', segments: allChanged(diffContent(line.text)) })
      index++
      continue
    }
    index++
  }

  return rows
}

export const buildDiffDisplayRows = (unifiedDiff: string): DiffDisplayRow[] => {
  const lines = parseUnifiedDiffLines(unifiedDiff).filter(
    (line) =>
      line.kind !== 'meta' &&
      line.kind !== 'hunk' &&
      !isNoNewlineMarker(line.text)
  )
  return pairDelAddBlocks(lines)
}
