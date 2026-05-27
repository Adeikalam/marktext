import { describe, expect, it } from 'vitest'
import {
  classifyDiffLine,
  parseUnifiedDiffLines,
  parseUnifiedDiffLinesForDisplay
} from '../../../src/renderer/src/util/gitDiffLines'

describe('gitDiffLines', () => {
  it('classifies meta lines before single-character prefixes', () => {
    expect(classifyDiffLine('diff --git a/foo b/foo')).toBe('meta')
    expect(classifyDiffLine('index 87451e7..8d84c23 100644')).toBe('meta')
    expect(classifyDiffLine('--- a/foo.md')).toBe('meta')
    expect(classifyDiffLine('+++ b/foo.md')).toBe('meta')
  })

  it('classifies hunk headers', () => {
    expect(classifyDiffLine('@@ -1 +1 @@')).toBe('hunk')
  })

  it('classifies additions and deletions', () => {
    expect(classifyDiffLine('+test 4')).toBe('add')
    expect(classifyDiffLine('-test 3')).toBe('del')
  })

  it('classifies context and no-newline markers', () => {
    expect(classifyDiffLine(' context line')).toBe('context')
    expect(classifyDiffLine('\\ No newline at end of file')).toBe('context')
    expect(classifyDiffLine('')).toBe('context')
  })

  it('parses a unified diff into line objects', () => {
    const patch = [
      'diff --git a/test.md b/test.md',
      'index 111..222 100644',
      '--- a/test.md',
      '+++ b/test.md',
      '@@ -1 +1 @@',
      '-old',
      '+new'
    ].join('\n')

    expect(parseUnifiedDiffLines(patch)).toEqual([
      { kind: 'meta', text: 'diff --git a/test.md b/test.md' },
      { kind: 'meta', text: 'index 111..222 100644' },
      { kind: 'meta', text: '--- a/test.md' },
      { kind: 'meta', text: '+++ b/test.md' },
      { kind: 'hunk', text: '@@ -1 +1 @@' },
      { kind: 'del', text: '-old' },
      { kind: 'add', text: '+new' }
    ])
  })

  it('returns empty array for empty input', () => {
    expect(parseUnifiedDiffLines('')).toEqual([])
  })

  it('omits meta lines for display', () => {
    const patch = [
      'diff --git a/test.md b/test.md',
      'index 111..222 100644',
      '--- a/test.md',
      '+++ b/test.md',
      '@@ -1 +1 @@',
      '-old',
      '+new'
    ].join('\n')

    expect(parseUnifiedDiffLinesForDisplay(patch)).toEqual([
      { kind: 'del', text: '-old' },
      { kind: 'add', text: '+new' }
    ])
  })

  it('omits no-newline markers and hunk headers for display', () => {
    const patch = [
      '@@ -1 +1 @@',
      '-old',
      '\\ No newline at end of file',
      '+new',
      '\\ No newline at end of file'
    ].join('\n')

    expect(parseUnifiedDiffLinesForDisplay(patch)).toEqual([
      { kind: 'del', text: '-old' },
      { kind: 'add', text: '+new' }
    ])
  })
})
