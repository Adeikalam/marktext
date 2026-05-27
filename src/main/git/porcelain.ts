import type { GitChangedFile } from '@shared/types/git'

const isStatusLine = (entry: string): boolean => entry.length >= 4 && entry[2] === ' '

export const parsePorcelainV1 = (output: string): GitChangedFile[] => {
  const files: GitChangedFile[] = []
  if (!output) return files

  const entries = output.split('\0').filter((entry) => entry.length > 0)
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry) continue
    if (entry.startsWith('##')) continue
    if (!isStatusLine(entry)) continue

    const indexStatus = entry[0] ?? ' '
    const worktreeStatus = entry[1] ?? ' '
    let path = entry.slice(3)

    let kind: GitChangedFile['kind'] | null = null

    if (indexStatus === '?' && worktreeStatus === '?') {
      kind = 'added'
    } else if (indexStatus === 'D' || worktreeStatus === 'D') {
      kind = 'deleted'
    } else if (indexStatus === 'R' || worktreeStatus === 'R' || indexStatus === 'C' || worktreeStatus === 'C') {
      kind = 'renamed'
      const next = entries[i + 1]
      if (next && !isStatusLine(next) && !next.startsWith('##')) {
        path = next
        i++
      }
    } else if (indexStatus !== ' ' || worktreeStatus !== ' ') {
      kind = 'modified'
    }

    if (!kind) continue

    const staged = indexStatus !== ' ' && indexStatus !== '?'
    files.push({ path, kind, staged })
  }

  return files.sort((a, b) => a.path.localeCompare(b.path))
}

export const parseAheadBehind = (output: string): { ahead: number; behind: number } => {
  const trimmed = output.trim()
  if (!trimmed) return { ahead: 0, behind: 0 }

  const [aheadRaw, behindRaw] = trimmed.split(/\s+/)
  const ahead = Number.parseInt(aheadRaw ?? '0', 10)
  const behind = Number.parseInt(behindRaw ?? '0', 10)

  return {
    ahead: Number.isNaN(ahead) ? 0 : ahead,
    behind: Number.isNaN(behind) ? 0 : behind
  }
}
