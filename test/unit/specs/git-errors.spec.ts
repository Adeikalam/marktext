import { describe, expect, it } from 'vitest'
import { toUserError } from '../../../src/main/git/errors'

describe('git errors', () => {
  it('maps missing git executable to git_not_found', () => {
    expect(toUserError(new Error('git_not_found')).code).toBe('git_not_found')
  })

  it('maps authentication failures', () => {
    expect(toUserError(new Error('Authentication failed for ...')).code).toBe('auth_failed')
    expect(toUserError(new Error('HTTP 401')).code).toBe('auth_failed')
  })

  it('maps network failures', () => {
    expect(toUserError(new Error('Could not resolve host: dev.azure.com')).code).toBe('network_failure')
    expect(toUserError(new Error('Connection refused')).code).toBe('network_failure')
  })

  it('maps push and pull failures', () => {
    expect(toUserError(new Error('! [rejected] main -> main (non-fast-forward)')).code).toBe('push_rejected')
    expect(toUserError(new Error('fatal: Not possible to fast-forward, aborting.')).code).toBe('ff_only_failed')
    expect(toUserError(new Error('Automatic merge failed; fix conflicts and then commit the result.')).code).toBe(
      'pull_conflicts'
    )
  })

  it('preserves error code from GitUserError objects', () => {
    expect(toUserError({ code: 'ff_only_failed', message: 'ignored' }).code).toBe('ff_only_failed')
  })
})
