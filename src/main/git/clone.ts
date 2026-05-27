import type { GitCloneRequest, GitCloneResult, GitProgressEvent } from '@shared/types/git'
import { isAuthenticated } from './auth'
import { normalizeCloneUrl } from './parse'
import { runGit } from './runner'
import { ensureEmptyOrMissing } from './service'

const parseProgressLine = (line: string): Pick<GitProgressEvent, 'phase' | 'loaded' | 'total'> | null => {
  const trimmed = line.trim()
  if (!trimmed) return null

  const countMatch = trimmed.match(/\((\d+)\/(\d+)\)/)
  const percentMatch = trimmed.match(/(\d+)%/)

  return {
    phase: trimmed,
    loaded: countMatch ? Number.parseInt(countMatch[1] ?? '0', 10) : undefined,
    total: countMatch
      ? Number.parseInt(countMatch[2] ?? '0', 10)
      : percentMatch
        ? Number.parseInt(percentMatch[1] ?? '0', 10)
        : undefined
  }
}

export const cloneRepository = async(
  req: GitCloneRequest,
  onProgress?: (event: GitProgressEvent) => void
): Promise<GitCloneResult> => {
  const parsed = normalizeCloneUrl(req.url)
  await ensureEmptyOrMissing(req.destinationPath)

  if (!(await isAuthenticated(parsed.hostKey))) {
    throw new Error('auth_failed')
  }

  const operationId = `clone-${Date.now()}`
  let pendingLine = ''

  await runGit(
    [
      'clone',
      '--depth',
      String(req.depth ?? 1),
      '--single-branch',
      '--progress',
      parsed.url,
      req.destinationPath
    ],
    {
      auth: { hostKey: parsed.hostKey },
      onStderr: (chunk) => {
        pendingLine += chunk
        const lines = pendingLine.split(/\r?\n/)
        pendingLine = lines.pop() ?? ''

        for (const line of lines) {
          const progress = parseProgressLine(line)
          if (progress) {
            onProgress?.({
              operationId,
              phase: progress.phase,
              loaded: progress.loaded,
              total: progress.total
            })
          }
        }
      }
    }
  )

  const { stdout } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: req.destinationPath
  })
  const branch = stdout.trim()
  return { repoRoot: req.destinationPath, branch: branch === 'HEAD' ? null : branch }
}
