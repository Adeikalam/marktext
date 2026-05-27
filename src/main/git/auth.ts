import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import keytar from 'keytar'
import log from 'electron-log'
import { hostKeyFromUrl, hostnameFromHostKey } from './parse'
import { runGit } from './runner'

const SERVICE_NAME = 'marktext'
const CREDENTIAL_PREFIX = 'git-credentials-'

let warnedKeychainUnavailable = false

export interface GitCredentials {
  username: string
  password: string
}

const credentialStorageKey = (hostKey: string): string => `${CREDENTIAL_PREFIX}${hostKey}`

const fallbackPath = (): string => path.join(app.getPath('userData'), 'git-credentials-meta.json')

const credentialStorePath = (): string => path.join(app.getPath('userData'), 'git-credentials')

export const getCredentialStorePath = (): string => credentialStorePath()

const credentialHelperArgs = (): string[] => [
  '-c',
  `credential.helper=store --file=${credentialStorePath()}`
]

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
    'OS keychain unavailable for Git credentials; using encrypted local fallback in userData:',
    err
  )
}

const readFallbackStore = async(): Promise<Record<string, string>> => {
  try {
    const raw = await fs.readFile(fallbackPath(), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error('Failed to read Git credentials fallback store:', err)
    }
    return {}
  }
}

const writeFallbackStore = async(data: Record<string, string>): Promise<void> => {
  await fs.writeFile(fallbackPath(), JSON.stringify(data, null, 2), { mode: 0o600 })
}

const readSecureValue = async(key: string): Promise<string | null> => {
  try {
    const fromKeychain = await keytar.getPassword(SERVICE_NAME, key)
    if (fromKeychain) return fromKeychain
  } catch (err) {
    if (isKeychainError(err)) {
      warnKeychainOnce(err)
    } else {
      log.error('Failed to read Git credentials from keychain:', err)
    }
  }

  const store = await readFallbackStore()
  return store[key] ?? null
}

const writeSecureValue = async(key: string, value: string): Promise<void> => {
  try {
    await keytar.setPassword(SERVICE_NAME, key, value)
    return
  } catch (err) {
    if (!isKeychainError(err)) throw err
    warnKeychainOnce(err)
  }

  const store = await readFallbackStore()
  store[key] = value
  await writeFallbackStore(store)
}

const deleteSecureValue = async(key: string): Promise<void> => {
  try {
    await keytar.deletePassword(SERVICE_NAME, key)
  } catch (err) {
    if (!isKeychainError(err)) {
      log.error('Failed to delete Git credentials from keychain:', err)
    }
  }

  const store = await readFallbackStore()
  if (store[key]) {
    delete store[key]
    await writeFallbackStore(store)
  }
}

const ensureCredentialStoreFile = async(): Promise<void> => {
  const filePath = credentialStorePath()
  try {
    await fs.access(filePath)
  } catch {
    await fs.writeFile(filePath, '', { mode: 0o600 })
  }
}

const formatCredentialInput = (hostKey: string, creds: GitCredentials): string => {
  const host = hostnameFromHostKey(hostKey)
  return `protocol=https\nhost=${host}\nusername=${creds.username}\npassword=${creds.password}\n\n`
}

const formatCredentialLookup = (hostKey: string): string => {
  const host = hostnameFromHostKey(hostKey)
  return `protocol=https\nhost=${host}\n\n`
}

const approveGitCredential = async(hostKey: string, creds: GitCredentials): Promise<void> => {
  await ensureCredentialStoreFile()
  await runGit(['credential', 'approve'], {
    extraConfigArgs: credentialHelperArgs(),
    stdin: formatCredentialInput(hostKey, creds)
  })
}

const rejectGitCredential = async(hostKey: string): Promise<void> => {
  await ensureCredentialStoreFile()
  try {
    await runGit(['credential', 'reject'], {
      extraConfigArgs: credentialHelperArgs(),
      stdin: formatCredentialLookup(hostKey)
    })
  } catch {
    /* reject is best-effort when clearing credentials */
  }
}

export const saveCredentials = async(hostKey: string, creds: GitCredentials): Promise<void> => {
  await writeSecureValue(credentialStorageKey(hostKey), JSON.stringify(creds))
  await approveGitCredential(hostKey, creds)
}

export const deleteCredentials = async(hostKey: string): Promise<void> => {
  await rejectGitCredential(hostKey)
  await deleteSecureValue(credentialStorageKey(hostKey))
}

export const isAuthenticated = async(hostKey: string): Promise<boolean> => {
  const raw = await readSecureValue(credentialStorageKey(hostKey))
  if (!raw) return false

  try {
    const parsed = JSON.parse(raw) as GitCredentials
    return !!parsed.password
  } catch {
    return false
  }
}

export const authConfigArgs = async(hostKey: string): Promise<string[]> => {
  if (!(await isAuthenticated(hostKey))) {
    throw new Error('auth_failed')
  }
  return credentialHelperArgs()
}

export const hostKeyForRepo = async(repoRoot: string): Promise<string | null> => {
  try {
    const config = await fs.readFile(`${repoRoot}/.git/config`, 'utf8')
    const match = config.match(/url\s*=\s*(.+)/i)
    if (!match?.[1]) return null
    return hostKeyFromUrl(match[1].trim())
  } catch {
    return null
  }
}
