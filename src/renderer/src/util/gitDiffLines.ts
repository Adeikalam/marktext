export type DiffLineKind = 'meta' | 'hunk' | 'add' | 'del' | 'context'

export interface ParsedDiffLine {
  kind: DiffLineKind
  text: string
}

export const classifyDiffLine = (line: string): DiffLineKind => {
  if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ')
  ) {
    return 'meta'
  }
  if (line.startsWith('@@')) {
    return 'hunk'
  }
  if (line.startsWith('+')) {
    return 'add'
  }
  if (line.startsWith('-')) {
    return 'del'
  }
  return 'context'
}

export const parseUnifiedDiffLines = (unifiedDiff: string): ParsedDiffLine[] => {
  if (!unifiedDiff) return []
  return unifiedDiff.split('\n').map((text) => ({
    kind: classifyDiffLine(text),
    text
  }))
}

const NO_NEWLINE_MARKER = '\\ No newline at end of file'

export const isNoNewlineMarker = (line: string): boolean => line === NO_NEWLINE_MARKER

/** Lines shown in the diff dialog (additions and deletions only). */
export const parseUnifiedDiffLinesForDisplay = (unifiedDiff: string): ParsedDiffLine[] =>
  parseUnifiedDiffLines(unifiedDiff).filter(
    (line) =>
      line.kind !== 'meta' &&
      line.kind !== 'hunk' &&
      !isNoNewlineMarker(line.text)
  )
