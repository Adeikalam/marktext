import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import keytar from 'keytar'
import log from 'electron-log'
import type { AuthCallback } from 'isomorphic-git'
import { hostKeyFromUrl } from './parse'

const SERVICE_NAME = 'marktext'
const PAT_PREFIX = 'git-pat-'

let warnedKeychainUnavailable = false

const patStorageKey = (hostKey: string): string => `${PAT_PREFIX}${hostKey}`

const fallbackPath = (): string => path.join(app.getPath('userData'), 'git-pats.json')

const isKeychainError = (err: unknown): boolean => {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? '')
  const lower = message.toLowerCase()
  return (
    lower.includes('freedesktop.secrets') ||
    lower.includes('keyring') ||
    lower.includes('keytar') ||
    lower.includes('secret service') ||
    lower.includes('the name org.freedesktop') ||
    lower.includes('cannot autolaunch d-bus')
  )
}

const warnKeychainOnce = (err: unknown): void => {
  if (warnedKeychainUnavailable) return
  warnedKeychainUnavailable = true
  log.warn(
    'OS keychain unavailable for Git tokens; using encrypted local fallback in userData:',
    err
  )
}

const readFallbackStore = async (): Promise<Record<string, string>> => {
  try {
    const raw = await fs.readFile(fallbackPath(), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error('Failed to read Git PAT fallback store:', err)
    }
    return {}
  }
}

const writeFallbackStore = async (data: Record<string, string>): Promise<void> => {
  const filePath = fallbackPath()
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
}

export { patStorageKey }

export const savePat = async (hostKey: string, pat: string): Promise<void> => {
  const key = patStorageKey(hostKey)
  try {
    await keytar.setPassword(SERVICE_NAME, key, pat)
    return
  } catch (err) {
    if (!isKeychainError(err)) throw err
    warnKeychainOnce(err)
  }

  const store = await readFallbackStore()
  store[key] = pat
  await writeFallbackStore(store)
}

export const getPat = async (hostKey: string): Promise<string | null> => {
  const key = patStorageKey(hostKey)
  try {
    const fromKeychain = await keytar.getPassword(SERVICE_NAME, key)
    if (fromKeychain) return fromKeychain
  } catch (err) {
    if (isKeychainError(err)) {
      warnKeychainOnce(err)
    } else {
      log.error('Failed to read Git PAT from keychain:', err)
    }
  }

  const store = await readFallbackStore()
  return store[key] ?? null
}

export const deletePat = async (hostKey: string): Promise<void> => {
  const key = patStorageKey(hostKey)
  try {
    await keytar.deletePassword(SERVICE_NAME, key)
  } catch (err) {
    if (!isKeychainError(err)) {
      log.error('Failed to delete Git PAT from keychain:', err)
    }
  }

  const store = await readFallbackStore()
  if (store[key]) {
    delete store[key]
    await writeFallbackStore(store)
  }
}

export const hasPat = async (hostKey: string): Promise<boolean> => {
  const pat = await getPat(hostKey)
  return !!pat
}

export const createOnAuth = (hostKey: string, patOverride?: string): AuthCallback => {
  return async () => {
    const pat = patOverride ?? (await getPat(hostKey))
    if (!pat) {
      throw new Error('auth_failed')
    }
    return { username: '', password: pat }
  }
}

export const hostKeyForRepo = async (repoRoot: string): Promise<string | null> => {
  try {
    const config = await fs.readFile(`${repoRoot}/.git/config`, 'utf8')
    const match = config.match(/url\s*=\s*(.+)/i)
    if (!match?.[1]) return null
    return hostKeyFromUrl(match[1].trim())
  } catch {
    return null
  }
}
