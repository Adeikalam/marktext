import { describe, expect, it } from 'vitest'
import { buildDiffDisplayRows, diffStringPair } from '../../../src/renderer/src/util/gitInlineDiff'

describe('gitInlineDiff', () => {
  it('highlights only differing characters in a line pair', () => {
    expect(diffStringPair('test 3', 'test 4')).toEqual({
      oldSegments: [
        { type: 'equal', text: 'test ' },
        { type: 'change', text: '3' }
      ],
      newSegments: [
        { type: 'equal', text: 'test ' },
        { type: 'change', text: '4' }
      ]
    })
  })

  it('marks an unpaired deletion as fully changed', () => {
    expect(buildDiffDisplayRows('-removed only')).toEqual([
      { kind: 'del', segments: [{ type: 'change', text: 'removed only' }] }
    ])
  })

  it('marks an unpaired addition as fully changed', () => {
    expect(buildDiffDisplayRows('+added only')).toEqual([
      { kind: 'add', segments: [{ type: 'change', text: 'added only' }] }
    ])
  })

  it('builds inline diff rows from a unified patch', () => {
    const patch = [
      'diff --git a/test.md b/test.md',
      '@@ -1 +1 @@',
      '-test 3',
      '+test 4'
    ].join('\n')

    expect(buildDiffDisplayRows(patch)).toEqual([
      {
        kind: 'change',
        oldSegments: [
          { type: 'equal', text: 'test ' },
          { type: 'change', text: '3' }
        ],
        newSegments: [
          { type: 'equal', text: 'test ' },
          { type: 'change', text: '4' }
        ]
      }
    ])
  })

  it('pairs multiple del/add lines in order', () => {
    const patch = ['-a', '-b', '+x', '+y'].join('\n')
    expect(buildDiffDisplayRows(patch)).toEqual([
      {
        kind: 'change',
        oldSegments: [{ type: 'change', text: 'a' }],
        newSegments: [{ type: 'change', text: 'x' }]
      },
      {
        kind: 'change',
        oldSegments: [{ type: 'change', text: 'b' }],
        newSegments: [{ type: 'change', text: 'y' }]
      }
    ])
  })
})
