import { diffStringPair, type InlineSegment } from './gitInlineDiff'

export type AlignedDiffRowKind = 'equal' | 'delete' | 'insert' | 'change'

export interface AlignedDiffRow {
  kind: AlignedDiffRowKind
  oldLineNumber: number | null
  newLineNumber: number | null
  oldText: string | null
  newText: string | null
  oldSegments: InlineSegment[] | null
  newSegments: InlineSegment[] | null
}

const splitLines = (content: string): string[] => content.split('\n')

const buildLcsTable = (oldLines: string[], newLines: string[]): number[][] => {
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  return dp
}

type LineOp =
  | { type: 'equal'; oldIndex: number; newIndex: number }
  | { type: 'delete'; oldIndex: number }
  | { type: 'insert'; newIndex: number }

const buildLineOps = (oldLines: string[], newLines: string[]): LineOp[] => {
  const dp = buildLcsTable(oldLines, newLines)
  const ops: LineOp[] = []
  let i = oldLines.length
  let j = newLines.length

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'equal', oldIndex: i - 1, newIndex: j - 1 })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'insert', newIndex: j - 1 })
      j--
    } else {
      ops.unshift({ type: 'delete', oldIndex: i - 1 })
      i--
    }
  }

  return ops
}

const pushChangeRow = (
  rows: AlignedDiffRow[],
  oldLineNumber: number | null,
  newLineNumber: number | null,
  oldText: string,
  newText: string
): void => {
  const { oldSegments, newSegments } = diffStringPair(oldText, newText)
  rows.push({
    kind: 'change',
    oldLineNumber,
    newLineNumber,
    oldText,
    newText,
    oldSegments,
    newSegments
  })
}

const flushDelIns = (
  rows: AlignedDiffRow[],
  dels: Array<{ lineNumber: number; text: string }>,
  ins: Array<{ lineNumber: number; text: string }>
): void => {
  const count = Math.max(dels.length, ins.length)
  for (let k = 0; k < count; k++) {
    const del = dels[k]
    const add = ins[k]
    if (del && add) {
      pushChangeRow(rows, del.lineNumber, add.lineNumber, del.text, add.text)
    } else if (del) {
      rows.push({
        kind: 'delete',
        oldLineNumber: del.lineNumber,
        newLineNumber: null,
        oldText: del.text,
        newText: null,
        oldSegments: null,
        newSegments: null
      })
    } else if (add) {
      rows.push({
        kind: 'insert',
        oldLineNumber: null,
        newLineNumber: add.lineNumber,
        oldText: null,
        newText: add.text,
        oldSegments: null,
        newSegments: null
      })
    }
  }
}

/** Build side-by-side rows from full file contents (VS Code-style alignment). */
export const buildAlignedLineDiff = (oldContent: string, newContent: string): AlignedDiffRow[] => {
  const oldLines = splitLines(oldContent)
  const newLines = splitLines(newContent)
  const ops = buildLineOps(oldLines, newLines)
  const rows: AlignedDiffRow[] = []
  let oldLineNumber = 0
  let newLineNumber = 0
  let pendingDeletes: Array<{ lineNumber: number; text: string }> = []
  let pendingInserts: Array<{ lineNumber: number; text: string }> = []

  const flushPending = (): void => {
    if (!pendingDeletes.length && !pendingInserts.length) return
    flushDelIns(rows, pendingDeletes, pendingInserts)
    pendingDeletes = []
    pendingInserts = []
  }

  for (const op of ops) {
    if (op.type === 'equal') {
      flushPending()
      oldLineNumber++
      newLineNumber++
      const text = oldLines[op.oldIndex]
      rows.push({
        kind: 'equal',
        oldLineNumber,
        newLineNumber,
        oldText: text,
        newText: text,
        oldSegments: null,
        newSegments: null
      })
      continue
    }

    if (op.type === 'delete') {
      oldLineNumber++
      pendingDeletes.push({ lineNumber: oldLineNumber, text: oldLines[op.oldIndex] })
      continue
    }

    newLineNumber++
    pendingInserts.push({ lineNumber: newLineNumber, text: newLines[op.newIndex] })
  }

  flushPending()
  return rows
}

export type ScrollbarMarkKind = 'del' | 'add' | 'change'

export interface ScrollbarMark {
  rowIndex: number
  kind: ScrollbarMarkKind
}

export const DIFF_VIEW_LINE_HEIGHT_PX = 20

export const scrollbarMarkStyle = (
  rowIndex: number,
  totalRows: number
): { top: string; height: string } => {
  if (totalRows <= 0) {
    return { top: '0%', height: '0%' }
  }
  const topPercent = (rowIndex / totalRows) * 100
  const heightPercent = Math.max(100 / totalRows, 0.6)
  return {
    top: `${topPercent}%`,
    height: `${heightPercent}%`
  }
}

export const oldPaneScrollbarMarks = (rows: AlignedDiffRow[]): ScrollbarMark[] => {
  const marks: ScrollbarMark[] = []
  rows.forEach((row, rowIndex) => {
    if (row.kind === 'delete') marks.push({ rowIndex, kind: 'del' })
    else if (row.kind === 'change') marks.push({ rowIndex, kind: 'change' })
  })
  return marks
}

export const newPaneScrollbarMarks = (rows: AlignedDiffRow[]): ScrollbarMark[] => {
  const marks: ScrollbarMark[] = []
  rows.forEach((row, rowIndex) => {
    if (row.kind === 'insert') marks.push({ rowIndex, kind: 'add' })
    else if (row.kind === 'change') marks.push({ rowIndex, kind: 'change' })
  })
  return marks
}
