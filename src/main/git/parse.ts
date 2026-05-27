import path from 'path'
import fs from 'fs/promises'
import pathe from 'pathe'

export interface ParsedRemoteUrl {
  url: string
  hostKey: string
  repoName: string | null
}

const SSH_PREFIX = 'git@'

export const normalizeCloneUrl = (raw: string): ParsedRemoteUrl => {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('invalid_url')
  }
  if (trimmed.startsWith(SSH_PREFIX)) {
    throw new Error('invalid_url')
  }

  let url = trimmed
  // Strip embedded credentials from pasted URLs.
  try {
    const parsed = new URL(trimmed)
    if (parsed.username || parsed.password) {
      parsed.username = ''
      parsed.password = ''
      url = parsed.toString()
    }
  } catch {
    throw new Error('invalid_url')
  }

  const hostKey = hostKeyFromUrl(url)
  const repoName = repoNameFromUrl(url)
  return { url, hostKey, repoName }
}

export const hostKeyFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host === 'dev.azure.com') {
      const parts = parsed.pathname.split('/').filter(Boolean)
      const org = parts[0]
      if (org) return `${host}/${org}`
    }
    if (host.endsWith('.visualstudio.com')) {
      const sub = host.replace('.visualstudio.com', '')
      return `visualstudio.com/${sub}`
    }
    return host
  } catch {
    return 'unknown'
  }
}

export const repoNameFromUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length === 0) return null
    const last = parts[parts.length - 1]
    if (last === '_git' && parts.length >= 2) {
      return parts[parts.length - 2] ?? null
    }
    return last.replace(/\.git$/i, '') ?? null
  } catch {
    return null
  }
}

export const findRepoRoot = async (startPath: string): Promise<string | null> => {
  let current = pathe.normalize(startPath)
  const root = pathe.parse(current).root

  while (current && current !== root) {
    const gitDir = pathe.join(current, '.git')
    try {
      const stat = await fs.stat(gitDir)
      if (stat.isDirectory()) return current
    } catch {
      /* not a repo at this level */
    }
    const parent = pathe.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

export const defaultCloneDestination = (repoName: string | null): string => {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const base = home ? path.join(home, 'Documents', 'MarkText') : path.join(process.cwd(), 'MarkText')
  const folder = repoName || 'repository'
  return path.join(base, folder)
}
