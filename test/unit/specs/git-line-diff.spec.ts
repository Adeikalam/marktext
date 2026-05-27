import { describe, expect, it } from 'vitest'
import { buildAlignedLineDiff } from '../../../src/renderer/src/util/gitLineDiff'

describe('gitLineDiff', () => {
  it('aligns equal lines with shared line numbers', () => {
    expect(buildAlignedLineDiff('line one\nline two', 'line one\nline two')).toEqual([
      {
        kind: 'equal',
        oldLineNumber: 1,
        newLineNumber: 1,
        oldText: 'line one',
        newText: 'line one',
        oldSegments: null,
        newSegments: null
      },
      {
        kind: 'equal',
        oldLineNumber: 2,
        newLineNumber: 2,
        oldText: 'line two',
        newText: 'line two',
        oldSegments: null,
        newSegments: null
      }
    ])
  })

  it('shows a modification with inline segments', () => {
    const rows = buildAlignedLineDiff('test 3', 'test 4')
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('change')
    expect(rows[0].oldSegments).toEqual([
      { type: 'equal', text: 'test ' },
      { type: 'change', text: '3' }
    ])
    expect(rows[0].newSegments).toEqual([
      { type: 'equal', text: 'test ' },
      { type: 'change', text: '4' }
    ])
  })

  it('shows insert-only lines on the new side', () => {
    expect(buildAlignedLineDiff('a', 'a\nb')).toEqual([
      {
        kind: 'equal',
        oldLineNumber: 1,
        newLineNumber: 1,
        oldText: 'a',
        newText: 'a',
        oldSegments: null,
        newSegments: null
      },
      {
        kind: 'insert',
        oldLineNumber: null,
        newLineNumber: 2,
        oldText: null,
        newText: 'b',
        oldSegments: null,
        newSegments: null
      }
    ])
  })

  it('shows delete-only lines on the old side', () => {
    expect(buildAlignedLineDiff('a\nb', 'a')).toEqual([
      {
        kind: 'equal',
        oldLineNumber: 1,
        newLineNumber: 1,
        oldText: 'a',
        newText: 'a',
        oldSegments: null,
        newSegments: null
      },
      {
        kind: 'delete',
        oldLineNumber: 2,
        newLineNumber: null,
        oldText: 'b',
        newText: null,
        oldSegments: null,
        newSegments: null
      }
    ])
  })
})
