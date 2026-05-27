import { describe, expect, it } from 'vitest'
import { hostKeyFromUrl, normalizeCloneUrl, repoNameFromUrl } from '../../../src/main/git/parse'

describe('git parse', () => {
  it('normalizes Azure DevOps URLs', () => {
    const parsed = normalizeCloneUrl(
      'https://dev.azure.com/contoso/docs/_git/handbook'
    )
    expect(parsed.hostKey).toBe('dev.azure.com/contoso')
    expect(parsed.repoName).toBe('handbook')
    expect(parsed.url).toContain('dev.azure.com/contoso/docs/_git/handbook')
  })

  it('rejects SSH URLs', () => {
    expect(() => normalizeCloneUrl('git@github.com:org/repo.git')).toThrow('invalid_url')
  })

  it('extracts host key from legacy visualstudio URL host', () => {
    expect(hostKeyFromUrl('https://contoso.visualstudio.com/project/_git/repo')).toBe(
      'visualstudio.com/contoso'
    )
  })

  it('extracts repo name from git suffix', () => {
    expect(repoNameFromUrl('https://example.com/org/repo.git')).toBe('repo')
  })
})
