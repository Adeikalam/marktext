import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import type { GitCloneRequest, GitCloneResult, GitProgressEvent } from '@shared/types/git'
import { gitFs } from './fs'
import { createOnAuth, savePat } from './auth'
import { normalizeCloneUrl } from './parse'
import { ensureEmptyOrMissing } from './service'

export const cloneRepository = async (
  req: GitCloneRequest,
  onProgress?: (event: GitProgressEvent) => void
): Promise<GitCloneResult> => {
  const parsed = normalizeCloneUrl(req.url)
  await ensureEmptyOrMissing(req.destinationPath)

  const operationId = `clone-${Date.now()}`

  await git.clone({
    fs: gitFs,
    http,
    dir: req.destinationPath,
    url: parsed.url,
    depth: req.depth ?? 1,
    singleBranch: true,
    onAuth: createOnAuth(parsed.hostKey, req.pat),
    onProgress: (progress) => {
      onProgress?.({
        operationId,
        phase: progress.phase,
        loaded: progress.loaded,
        total: progress.total
      })
    }
  })

  // Persist PAT after a successful clone so keychain issues cannot block the connect flow.
  await savePat(parsed.hostKey, req.pat)

  const branch = (await git.currentBranch({ fs: gitFs, dir: req.destinationPath })) ?? null
  return { repoRoot: req.destinationPath, branch }
}
