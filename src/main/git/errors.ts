import log from 'electron-log'
import type { GitErrorCode, GitUserError } from '@shared/types/git'

const USER_MESSAGES: Record<GitErrorCode, string> = {
  auth_failed: 'Your Git credentials expired or are invalid. Enter them again in Source Control.',
  not_a_repo: "This folder isn't connected to shared documentation yet.",
  push_rejected: 'Get latest changes first, then share again.',
  network_failure: "Couldn't reach the server. Check your internet connection.",
  pull_conflicts: "We couldn't automatically combine changes. Your file still has your edits.",
  ff_only_failed: 'Get latest changes first, then share again.',
  invalid_url: 'That link does not look like a valid repository URL.',
  path_exists: 'A folder already exists at that location.',
  git_not_found: "Git isn't installed. Install Git and restart MarkText to use Source Control.",
  unknown: 'Something went wrong. Please try again.'
}

export const toUserError = (err: unknown, fallback: GitErrorCode = 'unknown'): GitUserError => {
  const code = mapErrorCode(err, fallback)
  log.error('[git]', err)
  return { code, message: USER_MESSAGES[code] }
}

/** Electron IPC only surfaces `Error.message` reliably — attach code on the Error object. */
export const rethrowUserError = (err: unknown, fallback: GitErrorCode = 'unknown'): never => {
  const userError = toUserError(err, fallback)
  throw Object.assign(new Error(userError.message), userError)
}

const mapErrorCode = (err: unknown, fallback: GitErrorCode): GitErrorCode => {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? '')
  const lower = message.toLowerCase()

  if (message === 'git_not_found' || (lower.includes('enoent') && lower.includes('git'))) {
    return 'git_not_found'
  }
  if (message === 'auth_failed' || lower.includes('401') || lower.includes('403') || lower.includes('authentication')) {
    return 'auth_failed'
  }
  if (message === 'invalid_url') return 'invalid_url'
  if (message === 'not_a_repo') return 'not_a_repo'
  if (message === 'path_exists') return 'path_exists'
  if (message === 'pull_conflicts' || message === 'ff_only_failed') return message as GitErrorCode
  if (
    lower.includes('could not resolve host') ||
    lower.includes('connection refused') ||
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('timeout') ||
    lower.includes('fetch failed') ||
    lower.includes('unable to access')
  ) {
    return 'network_failure'
  }
  if (lower.includes('not possible to fast-forward') || lower.includes('fatal: not possible to fast-forward')) {
    return 'ff_only_failed'
  }
  if (
    lower.includes('conflict') ||
    lower.includes('unmerged paths') ||
    lower.includes('merge conflict')
  ) {
    return 'pull_conflicts'
  }
  if (lower.includes('not our ref') || lower.includes('non-fast-forward') || lower.includes('rejected')) {
    return 'push_rejected'
  }
  return fallback
}

export const assertSuccess = <T>(result: T | void, fallback: GitErrorCode = 'unknown'): T => {
  if (result === undefined) {
    throw new Error(fallback)
  }
  return result
}
