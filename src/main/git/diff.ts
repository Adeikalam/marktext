import { createTwoFilesPatch } from 'diff'
import git from 'isomorphic-git'
import fs from 'fs/promises'
import path from 'path'
import { gitFs } from './fs'

export interface FileDiffResult {
  unifiedDiff: string
  additions: number
  deletions: number
}

export const diffFile = async (repoRoot: string, filePath: string): Promise<FileDiffResult> => {
  const rel = filePath.replace(/\\/g, '/')
  let oldContent = ''
  let newContent = ''

  try {
    const { blob } = await git.readBlob({
      fs: gitFs,
      dir: repoRoot,
      oid: await git.resolveRef({ fs: gitFs, dir: repoRoot, ref: 'HEAD' }),
      filepath: rel
    })
    oldContent = Buffer.from(blob).toString('utf8')
  } catch {
    oldContent = ''
  }

  try {
    newContent = await fs.readFile(path.join(repoRoot, rel), 'utf8')
  } catch {
    newContent = ''
  }

  const unifiedDiff = createTwoFilesPatch(
    `a/${rel}`,
    `b/${rel}`,
    oldContent,
    newContent,
    '',
    '',
    { context: 3 }
  )

  let additions = 0
  let deletions = 0
  for (const line of unifiedDiff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++
    if (line.startsWith('-') && !line.startsWith('---')) deletions++
  }

  return { unifiedDiff, additions, deletions }
}
