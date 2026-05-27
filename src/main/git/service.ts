import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import fs from 'fs/promises'
import type {
  GitChangedFile,
  GitCommitRequest,
  GitCommitResult,
  GitDiffResult,
  GitPullResult,
  GitStatusResult,
  GitSyncStatus
} from '@shared/types/git'
import { gitFs } from './fs'
import { createOnAuth, hostKeyForRepo } from './auth'
import { diffFile } from './diff'
import { findRepoRoot } from './parse'
import { toUserError } from './errors'

const mapStatusMatrix = (matrix: [string, number, number, number][]): GitChangedFile[] => {
  const files: GitChangedFile[] = []

  for (const [filepath, head, workdir, stage] of matrix) {
    if (!filepath || filepath.endsWith('/')) continue

    let kind: GitChangedFile['kind'] | null = null
    const staged = stage === 2 || stage === 3

    if (head === 0 && (workdir === 2 || stage === 2 || stage === 3)) {
      kind = 'added'
    } else if (head !== 0 && workdir === 0 && stage !== 2 && stage !== 3) {
      kind = 'deleted'
    } else if (workdir === 2 || stage === 2) {
      kind = 'modified'
    }

    if (kind) {
      files.push({ path: filepath, kind, staged })
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path))
}

const countAheadBehind = async (
  dir: string,
  branch: string
): Promise<Pick<GitSyncStatus, 'ahead' | 'behind'>> => {
  const remoteRef = `refs/remotes/origin/${branch}`
  let remoteOid: string
  try {
    remoteOid = await git.resolveRef({ fs: gitFs, dir, ref: remoteRef })
  } catch {
    return { ahead: 0, behind: 0 }
  }

  const localOid = await git.resolveRef({ fs: gitFs, dir, ref: 'HEAD' })
  if (localOid === remoteOid) return { ahead: 0, behind: 0 }

  const localLog = await git.log({ fs: gitFs, dir, ref: localOid, depth: 200 })
  const remoteLog = await git.log({ fs: gitFs, dir, ref: remoteOid, depth: 200 })
  const remoteSet = new Set(remoteLog.map((c) => c.oid))
  const localSet = new Set(localLog.map((c) => c.oid))

  let ahead = 0
  for (const commit of localLog) {
    if (!remoteSet.has(commit.oid)) ahead++
    else break
  }

  let behind = 0
  for (const commit of remoteLog) {
    if (!localSet.has(commit.oid)) behind++
    else break
  }

  return { ahead, behind }
}

export const detectRepo = async (startPath: string): Promise<string | null> => {
  return findRepoRoot(startPath)
}

const currentBranchOrNull = async (dir: string): Promise<string | null> => {
  return (await git.currentBranch({ fs: gitFs, dir })) ?? null
}

export const getStatus = async (
  startPath: string,
  lastFetchedAt: number | null = null
): Promise<GitStatusResult> => {
  const repoRoot = await findRepoRoot(startPath)
  if (!repoRoot) {
    return { repoRoot: null, branch: null, sync: null, changedFiles: [] }
  }

  const branch = await currentBranchOrNull(repoRoot)
  const matrix = await git.statusMatrix({ fs: gitFs, dir: repoRoot })
  const changedFiles = mapStatusMatrix(matrix)

  let sync: GitSyncStatus | null = null
  if (branch) {
    const { ahead, behind } = await countAheadBehind(repoRoot, branch)
    sync = {
      branch,
      ahead,
      behind,
      lastFetchedAt,
      hasUncommittedChanges: changedFiles.length > 0
    }
  }

  return { repoRoot, branch, sync, changedFiles }
}

export const fetchRemote = async (repoRoot: string): Promise<GitStatusResult> => {
  const hostKey = await hostKeyForRepo(repoRoot)
  if (!hostKey) throw new Error('not_a_repo')

  await git.fetch({
    fs: gitFs,
    http,
    dir: repoRoot,
    remote: 'origin',
    onAuth: createOnAuth(hostKey)
  })

  return getStatus(repoRoot, Date.now())
}

export const getFileDiff = async (repoRoot: string, filePath: string): Promise<GitDiffResult> => {
  const { unifiedDiff, additions, deletions } = await diffFile(repoRoot, filePath)
  return { path: filePath, unifiedDiff, additions, deletions }
}

export const stagePaths = async (repoRoot: string, paths?: string[]): Promise<void> => {
  if (paths?.length) {
    for (const filepath of paths) {
      await git.add({ fs: gitFs, dir: repoRoot, filepath })
    }
    return
  }

  const matrix = await git.statusMatrix({ fs: gitFs, dir: repoRoot })
  for (const row of matrix) {
    const filepath = row[0]
    const head = row[1]
    const workdir = row[2] as number
    const stage = row[3] as number
    if (!filepath || filepath.endsWith('/')) continue
    if (workdir === 2 || stage === 2 || stage === 3 || (head === 0 && workdir === 2)) {
      await git.add({ fs: gitFs, dir: repoRoot, filepath })
    }
  }
}

export const commitChanges = async (req: GitCommitRequest): Promise<GitCommitResult> => {
  await stagePaths(req.repoRoot, req.paths)
  const oid = await git.commit({
    fs: gitFs,
    dir: req.repoRoot,
    message: req.message,
    author: req.author
  })
  return { oid }
}

export const pushBranch = async (repoRoot: string): Promise<void> => {
  const hostKey = await hostKeyForRepo(repoRoot)
  if (!hostKey) throw new Error('not_a_repo')

  const branch = await currentBranchOrNull(repoRoot)
  if (!branch) throw new Error('not_a_repo')

  await git.push({
    fs: gitFs,
    http,
    dir: repoRoot,
    remote: 'origin',
    ref: branch,
    onAuth: createOnAuth(hostKey)
  })
}

export const pullLatest = async (repoRoot: string): Promise<GitPullResult> => {
  const hostKey = await hostKeyForRepo(repoRoot)
  if (!hostKey) throw new Error('not_a_repo')

  const branch = await currentBranchOrNull(repoRoot)
  if (!branch) throw new Error('not_a_repo')

  await git.fetch({
    fs: gitFs,
    http,
    dir: repoRoot,
    remote: 'origin',
    ref: branch,
    onAuth: createOnAuth(hostKey)
  })

  try {
    const result = await git.merge({
      fs: gitFs,
      dir: repoRoot,
      ours: branch,
      theirs: `origin/${branch}`,
      fastForward: true
    })

    return {
      success: true,
      conflicts: false,
      conflictFiles: [],
      fastForward: !!result.fastForward
    }
  } catch (err) {
    const matrix = await git.statusMatrix({ fs: gitFs, dir: repoRoot })
    const conflictFiles = matrix
      .filter(([, , workdir, stage]) => workdir === 2 && stage === 2)
      .map(([filepath]) => filepath)

    if (conflictFiles.length > 0) {
      return {
        success: false,
        conflicts: true,
        conflictFiles,
        fastForward: false
      }
    }

    throw toUserError(err, 'ff_only_failed')
  }
}

export const ensureEmptyOrMissing = async (destinationPath: string): Promise<void> => {
  try {
    const stat = await fs.stat(destinationPath)
    if (!stat.isDirectory()) throw new Error('path_exists')
    const entries = await fs.readdir(destinationPath)
    if (entries.length > 0) throw new Error('path_exists')
  } catch (err) {
    if (err instanceof Error && err.message === 'path_exists') throw err
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.mkdir(destinationPath, { recursive: true })
      return
    }
    throw err
  }
}

export const publishChanges = async (
  repoRoot: string,
  message: string,
  author: { name: string; email: string }
): Promise<void> => {
  await commitChanges({ repoRoot, message, author })
  await pushBranch(repoRoot)
}
