import fs from 'fs/promises'
import type {
  GitCommitRequest,
  GitCommitResult,
  GitDiffResult,
  GitFileChangeKind,
  GitPullResult,
  GitStatusResult,
  GitSyncStatus
} from '@shared/types/git'
import { hostKeyForRepo } from './auth'
import { diffFile } from './diff'
import { findRepoRoot } from './parse'
import { runGit } from './runner'
import { parseAheadBehind, parsePorcelainV1 } from './porcelain'
import { rethrowUserError } from './errors'

const currentBranchOrNull = async(repoRoot: string): Promise<string | null> => {
  try {
    const { stdout } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot })
    const branch = stdout.trim()
    return branch === 'HEAD' ? null : branch
  } catch {
    return null
  }
}

const countAheadBehind = async(
  repoRoot: string,
  branch: string
): Promise<Pick<GitSyncStatus, 'ahead' | 'behind'>> => {
  try {
    const { stdout } = await runGit(
      ['rev-list', '--left-right', '--count', `HEAD...origin/${branch}`],
      { cwd: repoRoot }
    )
    return parseAheadBehind(stdout)
  } catch {
    return { ahead: 0, behind: 0 }
  }
}

const isShallowRepository = async(repoRoot: string): Promise<boolean> => {
  try {
    const { stdout } = await runGit(['rev-parse', '--is-shallow-repository'], { cwd: repoRoot })
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

/** Update origin/<branch> even when clone used --single-branch (default fetch only updates the cloned ref). */
export const fetchOriginBranch = async(
  repoRoot: string,
  branch: string,
  hostKey: string
): Promise<void> => {
  const args = ['fetch', 'origin', `refs/heads/${branch}:refs/remotes/origin/${branch}`]
  if (await isShallowRepository(repoRoot)) {
    args.push('--depth', '1', '--force')
  }
  await runGit(args, { cwd: repoRoot, auth: { hostKey } })
}

const listChangedFiles = async(repoRoot: string) => {
  const { stdout } = await runGit(['status', '--porcelain=v1', '-z'], { cwd: repoRoot })
  return parsePorcelainV1(stdout)
}

export const detectRepo = async(startPath: string): Promise<string | null> => {
  return findRepoRoot(startPath)
}

export const getStatus = async(
  startPath: string,
  lastFetchedAt: number | null = null
): Promise<GitStatusResult> => {
  const repoRoot = await findRepoRoot(startPath)
  if (!repoRoot) {
    return { repoRoot: null, branch: null, sync: null, changedFiles: [] }
  }

  const branch = await currentBranchOrNull(repoRoot)
  const changedFiles = await listChangedFiles(repoRoot)

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

export const fetchRemote = async(repoRoot: string): Promise<GitStatusResult> => {
  const hostKey = await hostKeyForRepo(repoRoot)
  if (!hostKey) throw new Error('not_a_repo')

  const branch = await currentBranchOrNull(repoRoot)
  if (branch) {
    await fetchOriginBranch(repoRoot, branch, hostKey)
  } else {
    await runGit(['fetch', 'origin'], { cwd: repoRoot, auth: { hostKey } })
  }

  return getStatus(repoRoot, Date.now())
}

export const getFileDiff = async(repoRoot: string, filePath: string): Promise<GitDiffResult> => {
  const { unifiedDiff, additions, deletions, oldContent, newContent } = await diffFile(
    repoRoot,
    filePath
  )
  return { path: filePath, unifiedDiff, additions, deletions, oldContent, newContent }
}

export const discardChanges = async(
  repoRoot: string,
  filePath: string,
  kind: GitFileChangeKind
): Promise<GitStatusResult> => {
  if (kind === 'added') {
    await runGit(['clean', '-f', '--', filePath], { cwd: repoRoot })
  } else {
    await runGit(['restore', '--source=HEAD', '--staged', '--worktree', '--', filePath], {
      cwd: repoRoot
    })
  }

  return getStatus(repoRoot)
}

export const stagePaths = async(repoRoot: string, paths?: string[]): Promise<void> => {
  if (paths?.length) {
    await runGit(['add', '--', ...paths], { cwd: repoRoot })
    return
  }

  await runGit(['add', '-A'], { cwd: repoRoot })
}

export const commitChanges = async(req: GitCommitRequest): Promise<GitCommitResult> => {
  await stagePaths(req.repoRoot, req.paths)
  const author = `${req.author.name} <${req.author.email}>`
  await runGit(['commit', '-m', req.message, '--author', author], { cwd: req.repoRoot })
  const { stdout } = await runGit(['rev-parse', 'HEAD'], { cwd: req.repoRoot })
  return { oid: stdout.trim() }
}

export const pushBranch = async(repoRoot: string): Promise<void> => {
  const hostKey = await hostKeyForRepo(repoRoot)
  if (!hostKey) throw new Error('not_a_repo')

  const branch = await currentBranchOrNull(repoRoot)
  if (!branch) throw new Error('not_a_repo')

  await runGit(['push', 'origin', branch], { cwd: repoRoot, auth: { hostKey } })
}

const listConflictFiles = async(repoRoot: string): Promise<string[]> => {
  try {
    const { stdout } = await runGit(['diff', '--name-only', '--diff-filter=U'], { cwd: repoRoot })
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const isAncestorOfOrigin = async(repoRoot: string, branch: string): Promise<boolean> => {
  try {
    await runGit(['merge-base', '--is-ancestor', 'HEAD', `origin/${branch}`], { cwd: repoRoot })
    return true
  } catch {
    return false
  }
}

const mergeFastForwardOnly = async(repoRoot: string, branch: string): Promise<void> => {
  await runGit(['merge', '--ff-only', `origin/${branch}`], { cwd: repoRoot })
}

export const pullLatest = async(repoRoot: string): Promise<GitPullResult> => {
  const hostKey = await hostKeyForRepo(repoRoot)
  if (!hostKey) throw new Error('not_a_repo')

  const branch = await currentBranchOrNull(repoRoot)
  if (!branch) throw new Error('not_a_repo')

  await fetchOriginBranch(repoRoot, branch, hostKey)

  let pullErr: unknown
  try {
    await mergeFastForwardOnly(repoRoot, branch)
    return {
      success: true,
      conflicts: false,
      conflictFiles: [],
      fastForward: true
    }
  } catch (err) {
    pullErr = err
  }

  if (await isShallowRepository(repoRoot)) {
    try {
      await runGit(['fetch', 'origin', branch, '--deepen=50'], { cwd: repoRoot, auth: { hostKey } })
      await fetchOriginBranch(repoRoot, branch, hostKey)
      await mergeFastForwardOnly(repoRoot, branch)
      return {
        success: true,
        conflicts: false,
        conflictFiles: [],
        fastForward: true
      }
    } catch (err) {
      pullErr = err
    }
  }

  const conflictFiles = await listConflictFiles(repoRoot)
  if (conflictFiles.length > 0) {
    return {
      success: false,
      conflicts: true,
      conflictFiles,
      fastForward: false
    }
  }

  const changedFiles = await listChangedFiles(repoRoot)
  const { ahead, behind } = await countAheadBehind(repoRoot, branch)

  if (changedFiles.length === 0 && behind > 0) {
    const canReset =
      ahead === 0 ||
      (await isShallowRepository(repoRoot)) ||
      !(await isAncestorOfOrigin(repoRoot, branch))

    if (canReset) {
      try {
        await runGit(['reset', '--hard', `origin/${branch}`], { cwd: repoRoot })
        return {
          success: true,
          conflicts: false,
          conflictFiles: [],
          fastForward: true
        }
      } catch {
        /* fall through to user error */
      }
    }
  }

  rethrowUserError(pullErr, 'ff_only_failed')
  throw new Error('pull failed')
}

export const ensureEmptyOrMissing = async(destinationPath: string): Promise<void> => {
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

export const publishChanges = async(
  repoRoot: string,
  message: string,
  author: { name: string; email: string }
): Promise<void> => {
  await commitChanges({ repoRoot, message, author })
  await pushBranch(repoRoot)
}
