import { describe, expect, it } from 'vitest'
import { parseAheadBehind, parsePorcelainV1 } from '../../../src/main/git/porcelain'

describe('git porcelain', () => {
  it('parses modified, added, and deleted files', () => {
    const output = [
      '## main...origin/main [ahead 1, behind 2]',
      ' M tracked-modified.md',
      'M  staged-modified.md',
      '?? untracked.md',
      ' D deleted.md'
    ].join('\0') + '\0'

    expect(parsePorcelainV1(output)).toEqual([
      { path: 'deleted.md', kind: 'deleted', staged: false },
      { path: 'staged-modified.md', kind: 'modified', staged: true },
      { path: 'tracked-modified.md', kind: 'modified', staged: false },
      { path: 'untracked.md', kind: 'added', staged: false }
    ])
  })

  it('parses renamed files using the destination path', () => {
    const output = 'R  old-name.md\0new-name.md\0'
    expect(parsePorcelainV1(output)).toEqual([
      { path: 'new-name.md', kind: 'renamed', staged: true }
    ])
  })

  it('parses ahead and behind counts', () => {
    expect(parseAheadBehind('2\t0\n')).toEqual({ ahead: 2, behind: 0 })
    expect(parseAheadBehind('0\t3')).toEqual({ ahead: 0, behind: 3 })
    expect(parseAheadBehind('')).toEqual({ ahead: 0, behind: 0 })
  })
})
