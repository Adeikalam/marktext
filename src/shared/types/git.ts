export type GitFileChangeKind = 'modified' | 'added' | 'deleted' | 'renamed'

export interface GitChangedFile {
  path: string
  kind: GitFileChangeKind
  staged: boolean
}

export interface GitSyncStatus {
  branch: string
  ahead: number
  behind: number
  lastFetchedAt: number | null
  hasUncommittedChanges: boolean
}

export interface GitStatusResult {
  repoRoot: string | null
  branch: string | null
  sync: GitSyncStatus | null
  changedFiles: GitChangedFile[]
}

export interface GitDiffResult {
  path: string
  unifiedDiff: string
  additions: number
  deletions: number
}

export interface GitCloneRequest {
  url: string
  destinationPath: string
  pat: string
  depth?: number
}

export interface GitCloneResult {
  repoRoot: string
  branch: string | null
}

export interface GitCommitRequest {
  repoRoot: string
  message: string
  author: { name: string; email: string }
  paths?: string[]
}

export interface GitCommitResult {
  oid: string
}

export interface GitPullResult {
  success: boolean
  conflicts: boolean
  conflictFiles: string[]
  fastForward: boolean
}

export interface GitProgressEvent {
  operationId: string
  phase: string
  loaded?: number
  total?: number
}

export type GitErrorCode =
  | 'auth_failed'
  | 'not_a_repo'
  | 'push_rejected'
  | 'network_failure'
  | 'pull_conflicts'
  | 'ff_only_failed'
  | 'invalid_url'
  | 'path_exists'
  | 'unknown'

export interface GitUserError {
  code: GitErrorCode
  message: string
}
