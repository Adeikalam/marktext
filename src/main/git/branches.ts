import type { GitBranch, GitStatusResult } from '@shared/types/git'
import { hostKeyForRepo } from './auth'
import { GitCommandError, runGit } from './runner'
import { fetchRemote, getStatus } from './service'

export const parseLsRemoteHeads = (stdout: string): string[] => {
  const names: string[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) continue
    const ref = parts[1] ?? ''
    if (ref.startsWith('refs/heads/')) {
      names.push(ref.slice('refs/heads/'.length))
    }
  }
  return names
}

export const parseLocalBranchNames = (stdout: string): string[] => {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export const mergeBranchLists = (
  localNames: string[],
  remoteNames: string[],
  currentBranch: string | null
): GitBranch[] => {
  const seen = new Set<string>()
  const allNames: string[] = []
  for (const name of [...localNames, ...remoteNames]) {
    if (!seen.has(name)) {
      seen.add(name)
      allNames.push(name)
    }
  }

  const branches = allNames.map((name) => ({
    name,
    current: name === currentBranch
  }))

  branches.sort((a, b) => {
    if (a.current) return -1
    if (b.current) return 1
    return a.name.localeCompare(b.name)
  })

  return branches
}

const currentBranchOrNull = async(repoRoot: string): Promise<string | null> => {
  try {
    const { stdout } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot })
    const branch = stdout.trim()
    return branch === 'HEAD' ? null : branch
  } catch {
    return null
  }
}

const localBranchExists = async(repoRoot: string, branchName: string): Promise<boolean> => {
  try {
    await runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], { cwd: repoRoot })
    return true
  } catch {
    return false
  }
}

const remoteBranchExists = async(
  repoRoot: string,
  branchName: string,
  hostKey: string
): Promise<boolean> => {
  try {
    const { stdout } = await runGit(['ls-remote', '--heads', 'origin', branchName], {
      cwd: repoRoot,
      auth: { hostKey }
    })
    return parseLsRemoteHeads(stdout).includes(branchName)
  } catch {
    return false
  }
}

export const listBranches = async(repoRoot: string): Promise<GitBranch[]> => {
  const hostKey = await hostKeyForRepo(repoRoot)
  if (!hostKey) throw new Error('not_a_repo')

  const currentBranch = await currentBranchOrNull(repoRoot)

  const { stdout: localStdout } = await runGit(
    ['for-each-ref', 'refs/heads', '--format=%(refname:short)'],
    { cwd: repoRoot }
  )
  const localNames = parseLocalBranchNames(localStdout)

  let remoteNames: string[] = []
  try {
    const { stdout: remoteStdout } = await runGit(['ls-remote', '--heads', 'origin'], {
      cwd: repoRoot,
      auth: { hostKey }
    })
    remoteNames = parseLsRemoteHeads(remoteStdout)
  } catch {
    /* fall back to local branches only when remote is unreachable */
  }

  return mergeBranchLists(localNames, remoteNames, currentBranch)
}

export const switchBranch = async(
  repoRoot: string,
  branchName: string
): Promise<GitStatusResult> => {
  const hostKey = await hostKeyForRepo(repoRoot)
  if (!hostKey) throw new Error('not_a_repo')

  const currentBranch = await currentBranchOrNull(repoRoot)
  if (currentBranch === branchName) {
    return getStatus(repoRoot)
  }

  const hasLocal = await localBranchExists(repoRoot, branchName)

  try {
    if (hasLocal) {
      await runGit(['switch', branchName], { cwd: repoRoot })
    } else {
      const hasRemote = await remoteBranchExists(repoRoot, branchName, hostKey)
      if (!hasRemote) {
        throw new Error('branch_not_found')
      }

      await runGit(
        [
          'fetch',
          'origin',
          `refs/heads/${branchName}:refs/heads/${branchName}`,
          '--depth',
          '1'
        ],
        { cwd: repoRoot, auth: { hostKey } }
      )
      await runGit(['switch', branchName], { cwd: repoRoot })
      await runGit(['config', `branch.${branchName}.remote`, 'origin'], { cwd: repoRoot })
      await runGit(['config', `branch.${branchName}.merge`, `refs/heads/${branchName}`], {
        cwd: repoRoot
      })
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'branch_not_found') {
      throw err
    }
    if (err instanceof GitCommandError) {
      const combined = `${err.message}\n${err.stderr}`.toLowerCase()
      if (
        combined.includes('local changes to the following files') ||
        combined.includes('would be overwritten by checkout') ||
        combined.includes('would be overwritten by switch')
      ) {
        throw new Error('checkout_blocked')
      }
      if (combined.includes('pathspec') && combined.includes('did not match')) {
        throw new Error('branch_not_found')
      }
      if (combined.includes('invalid reference')) {
        throw new Error('branch_not_found')
      }
    }
    throw err
  }

  return fetchRemote(repoRoot)
}
