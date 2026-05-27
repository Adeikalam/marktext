import { describe, expect, it } from 'vitest'
import {
  mergeBranchLists,
  parseLocalBranchNames,
  parseLsRemoteHeads
} from '../../../src/main/git/branches'
import { toUserError } from '../../../src/main/git/errors'

describe('git branches', () => {
  it('parses ls-remote heads output', () => {
    const output = [
      'abc123 refs/heads/main',
      'def456 refs/heads/develop',
      'ghi789 refs/heads/feature/docs'
    ].join('\n')

    expect(parseLsRemoteHeads(output)).toEqual(['main', 'develop', 'feature/docs'])
  })

  it('ignores non-head refs in ls-remote output', () => {
    const output = 'abc123 refs/tags/v1.0\n'
    expect(parseLsRemoteHeads(output)).toEqual([])
  })

  it('parses local branch names', () => {
    expect(parseLocalBranchNames('main\ndevelop\n\n')).toEqual(['main', 'develop'])
  })

  it('merges local and remote branches with current flag', () => {
    expect(mergeBranchLists(['main'], ['main', 'develop', 'release'], 'main')).toEqual([
      { name: 'main', current: true },
      { name: 'develop', current: false },
      { name: 'release', current: false }
    ])
  })

  it('deduplicates branch names from local and remote lists', () => {
    expect(mergeBranchLists(['main', 'develop'], ['main', 'release'], 'develop')).toEqual([
      { name: 'develop', current: true },
      { name: 'main', current: false },
      { name: 'release', current: false }
    ])
  })

  it('maps checkout overwrite errors to checkout_blocked', () => {
    expect(
      toUserError(
        new Error(
          'error: Your local changes to the following files would be overwritten by checkout:\n\tintro.md'
        )
      ).code
    ).toBe('checkout_blocked')
  })

  it('maps switch overwrite errors to checkout_blocked', () => {
    expect(
      toUserError(new Error('error: Your local changes would be overwritten by switch:')).code
    ).toBe('checkout_blocked')
  })

  it('maps invalid remote reference to branch_not_found', () => {
    expect(toUserError(new Error('fatal: invalid reference: origin/test')).code).toBe(
      'branch_not_found'
    )
  })
})
