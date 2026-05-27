import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  GitChangedFile,
  GitDiffResult,
  GitStatusResult,
  GitSyncStatus,
  GitUserError
} from '@shared/types/git'
import { useProjectStore } from './project'
import log from 'electron-log'

const DEFAULT_AUTHOR = {
  name: 'MarkText User',
  email: 'marktext@local'
}

const FETCH_INTERVAL_VISIBLE_MS = 3 * 60 * 1000
const FETCH_INTERVAL_HIDDEN_MS = 5 * 60 * 1000

export const useGitStore = defineStore('git', () => {
  const repoRoot = ref<string | null>(null)
  const branch = ref<string | null>(null)
  const syncStatus = ref<GitSyncStatus | null>(null)
  const changedFiles = ref<GitChangedFile[]>([])
  const conflictFiles = ref<string[]>([])
  const isLoading = ref(false)
  const isRepo = ref(false)
  const lastError = ref<string | null>(null)
  const diffResult = ref<GitDiffResult | null>(null)
  const showDiff = ref(false)
  const showCommitDialog = ref(false)
  const showCloneWizard = ref(false)

  let fetchTimerId: ReturnType<typeof setInterval> | null = null
  let statusUnsubscribe: (() => void) | null = null
  let refreshDebounce: ReturnType<typeof setTimeout> | null = null

  const applyStatus = (status: GitStatusResult): void => {
    repoRoot.value = status.repoRoot
    branch.value = status.branch
    syncStatus.value = status.sync
    changedFiles.value = status.changedFiles
    isRepo.value = !!status.repoRoot
    if (status.sync) {
      lastError.value = null
    }
  }

  const refresh = async (startPath?: string): Promise<void> => {
    const projectStore = useProjectStore()
    const path = startPath ?? projectStore.projectTree?.pathname
    if (!path) {
      applyStatus({ repoRoot: null, branch: null, sync: null, changedFiles: [] })
      isRepo.value = false
      return
    }

    isLoading.value = true
    try {
      const status = await window.git.status(path)
      applyStatus(status)
    } catch (err) {
      const message = formatError(err)
      lastError.value = message
      log.error('[git store] refresh failed:', err)
    } finally {
      isLoading.value = false
    }
  }

  const fetchRemote = async (): Promise<void> => {
    if (!repoRoot.value) return
    isLoading.value = true
    try {
      const status = await window.git.fetch(repoRoot.value)
      applyStatus(status)
    } catch (err) {
      lastError.value = formatError(err)
    } finally {
      isLoading.value = false
    }
  }

  const pullLatest = async (): Promise<void> => {
    if (!repoRoot.value) return
    isLoading.value = true
    conflictFiles.value = []
    try {
      const result = await window.git.pull(repoRoot.value)
      applyStatus(result.status)
      if (result.conflicts) {
        conflictFiles.value = result.conflictFiles
        lastError.value = null
      }
    } catch (err) {
      lastError.value = formatError(err)
    } finally {
      isLoading.value = false
    }
  }

  const publish = async (message: string): Promise<boolean> => {
    if (!repoRoot.value) return false
    isLoading.value = true
    try {
      const status = await window.git.publish({
        repoRoot: repoRoot.value,
        message,
        author: DEFAULT_AUTHOR
      })
      applyStatus(status)
      showCommitDialog.value = false
      return true
    } catch (err) {
      lastError.value = formatError(err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  const openDiff = async (filePath: string): Promise<void> => {
    if (!repoRoot.value) return
    isLoading.value = true
    try {
      diffResult.value = await window.git.diff(repoRoot.value, filePath)
      showDiff.value = true
    } catch (err) {
      lastError.value = formatError(err)
    } finally {
      isLoading.value = false
    }
  }

  const closeDiff = (): void => {
    showDiff.value = false
    diffResult.value = null
  }

  const scheduleRefresh = (): void => {
    if (refreshDebounce) clearTimeout(refreshDebounce)
    refreshDebounce = setTimeout(() => {
      refresh().catch(() => {})
    }, 300)
  }

  const stopPolling = (): void => {
    if (fetchTimerId) {
      clearInterval(fetchTimerId)
      fetchTimerId = null
    }
  }

  const startPolling = (intervalMs: number = FETCH_INTERVAL_HIDDEN_MS): void => {
    stopPolling()
    if (!isRepo.value) return
    fetchTimerId = setInterval(() => {
      fetchRemote().catch(() => {})
    }, intervalMs)
  }

  const initForProject = async (pathname: string | null): Promise<void> => {
    stopPolling()
    conflictFiles.value = []
    if (!pathname) {
      applyStatus({ repoRoot: null, branch: null, sync: null, changedFiles: [] })
      isRepo.value = false
      return
    }

    await refresh(pathname)
    if (isRepo.value) {
      await fetchRemote().catch(() => {})
      startPolling(FETCH_INTERVAL_HIDDEN_MS)
    }
  }

  const LISTEN_FOR_GIT = (): void => {
    statusUnsubscribe?.()
    statusUnsubscribe = window.git.onStatusChanged((status) => {
      applyStatus(status as GitStatusResult)
    })
  }

  const watchProject = (): void => {
    const projectStore = useProjectStore()
    watch(
      () => projectStore.projectTree?.pathname ?? null,
      (pathname) => {
        initForProject(pathname).catch(() => {})
      },
      { immediate: true }
    )
  }

  return {
    repoRoot,
    branch,
    syncStatus,
    changedFiles,
    conflictFiles,
    isLoading,
    isRepo,
    lastError,
    diffResult,
    showDiff,
    showCommitDialog,
    showCloneWizard,
    refresh,
    fetchRemote,
    pullLatest,
    publish,
    openDiff,
    closeDiff,
    scheduleRefresh,
    startPolling,
    stopPolling,
    initForProject,
    LISTEN_FOR_GIT,
    watchProject,
    FETCH_INTERVAL_VISIBLE_MS
  }
})

const formatError = (err: unknown): string => {
  if (err instanceof Error && err.message) {
    return err.message
  }
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as GitUserError).message)
  }
  return 'Something went wrong. Please try again.'
}
