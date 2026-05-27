import { ipcMain, type WebContents } from 'electron'
import type {
  GitCloneRequest,
  GitCommitRequest,
  GitCredentials,
  GitFileChangeKind,
  GitProgressEvent,
  GitStatusResult
} from '@shared/types/git'
import { cloneRepository } from '../git/clone'
import { listBranches, switchBranch } from '../git/branches'
import {
  commitChanges,
  detectRepo,
  discardChanges,
  fetchRemote,
  getFileDiff,
  getStatus,
  publishChanges,
  pullLatest,
  pushBranch,
  stagePaths
} from '../git/service'
import { deleteCredentials, hostKeyForRepo, isAuthenticated, saveCredentials } from '../git/auth'
import { hostKeyFromUrl, normalizeCloneUrl } from '../git/parse'
import { rethrowUserError } from '../git/errors'

const sendIfAlive = (sender: WebContents, channel: string, payload: unknown): void => {
  if (sender.isDestroyed()) return
  sender.send(channel, payload)
}

const notifyStatusChanged = async(sender: WebContents, startPath: string): Promise<void> => {
  try {
    const status = await getStatus(startPath)
    sendIfAlive(sender, 'mt::git::status-changed', status)
  } catch {
    /* ignore notification failures */
  }
}

export const registerGitHandlers = (): void => {
  ipcMain.handle('mt::git::detect-repo', async(_event, startPath: string) => {
    return detectRepo(startPath)
  })

  ipcMain.handle('mt::git::status', async(_event, startPath: string) => {
    try {
      return await getStatus(startPath)
    } catch (err) {
      throw rethrowUserError(err)
    }
  })

  ipcMain.handle('mt::git::list-branches', async(_event, repoRoot: string) => {
    try {
      return await listBranches(repoRoot)
    } catch (err) {
      throw rethrowUserError(err)
    }
  })

  ipcMain.handle('mt::git::switch-branch', async(event, repoRoot: string, branchName: string) => {
    try {
      const status = await switchBranch(repoRoot, branchName)
      sendIfAlive(event.sender, 'mt::git::status-changed', status)
      return status
    } catch (err) {
      throw rethrowUserError(err)
    }
  })

  ipcMain.handle('mt::git::fetch', async(event, repoRoot: string) => {
    try {
      const status = await fetchRemote(repoRoot)
      sendIfAlive(event.sender, 'mt::git::status-changed', status)
      return status
    } catch (err) {
      throw rethrowUserError(err)
    }
  })

  ipcMain.handle('mt::git::diff', async(_event, repoRoot: string, filePath: string) => {
    try {
      return await getFileDiff(repoRoot, filePath)
    } catch (err) {
      throw rethrowUserError(err)
    }
  })

  ipcMain.handle(
    'mt::git::discard',
    async(event, repoRoot: string, filePath: string, kind: GitFileChangeKind) => {
      try {
        const status = await discardChanges(repoRoot, filePath, kind)
        sendIfAlive(event.sender, 'mt::git::status-changed', status)
        return status
      } catch (err) {
        throw rethrowUserError(err)
      }
    }
  )

  ipcMain.handle('mt::git::stage', async(_event, repoRoot: string, paths?: string[]) => {
    try {
      await stagePaths(repoRoot, paths)
    } catch (err) {
      throw rethrowUserError(err)
    }
  })

  ipcMain.handle('mt::git::commit', async(event, req: GitCommitRequest) => {
    try {
      const result = await commitChanges(req)
      await notifyStatusChanged(event.sender, req.repoRoot)
      return result
    } catch (err) {
      throw rethrowUserError(err)
    }
  })

  ipcMain.handle('mt::git::push', async(event, repoRoot: string) => {
    try {
      await pushBranch(repoRoot)
      const status = await getStatus(repoRoot)
      sendIfAlive(event.sender, 'mt::git::status-changed', status)
      return status
    } catch (err) {
      throw rethrowUserError(err)
    }
  })

  ipcMain.handle('mt::git::pull', async(event, repoRoot: string) => {
    try {
      const result = await pullLatest(repoRoot)
      const status = await getStatus(repoRoot)
      sendIfAlive(event.sender, 'mt::git::status-changed', status)
      return { ...result, status }
    } catch (err) {
      throw rethrowUserError(err)
    }
  })

  ipcMain.handle(
    'mt::git::publish',
    async(
      event,
      payload: {
        repoRoot: string
        message: string
        author: { name: string; email: string }
      }
    ) => {
      try {
        await publishChanges(payload.repoRoot, payload.message, payload.author)
        const status = await getStatus(payload.repoRoot)
        sendIfAlive(event.sender, 'mt::git::status-changed', status)
        return status
      } catch (err) {
        throw rethrowUserError(err)
      }
    }
  )

  ipcMain.handle('mt::git::clone', async(event, req: GitCloneRequest) => {
    try {
      const onProgress = (progress: GitProgressEvent): void => {
        sendIfAlive(event.sender, 'mt::git::progress', progress)
      }
      return await cloneRepository(req, onProgress)
    } catch (err) {
      throw rethrowUserError(err)
    }
  })

  ipcMain.handle(
    'mt::git::save-credentials',
    async(_event, hostKey: string, credentials: GitCredentials) => {
      try {
        await saveCredentials(hostKey, credentials)
      } catch (err) {
        throw rethrowUserError(err)
      }
    }
  )

  ipcMain.handle('mt::git::disconnect', async(_event, hostKey: string) => {
    await deleteCredentials(hostKey)
  })

  ipcMain.handle('mt::git::is-authenticated', async(_event, hostKey: string) => {
    return isAuthenticated(hostKey)
  })

  ipcMain.handle('mt::git::host-key-from-url', async(_event, url: string) => {
    return hostKeyFromUrl(url)
  })

  ipcMain.handle('mt::git::normalize-url', async(_event, url: string) => {
    return normalizeCloneUrl(url)
  })

  ipcMain.handle('mt::git::host-key-for-repo', async(_event, repoRoot: string) => {
    return hostKeyForRepo(repoRoot)
  })
}

export type { GitStatusResult }
