import fs from 'fs/promises'
import path from 'path'
import { GitCommandError, runGit } from './runner'

export interface FileDiffResult {
  unifiedDiff: string
  additions: number
  deletions: number
  oldContent: string
  newContent: string
}

const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'

const countDiffStats = (unifiedDiff: string): Pick<FileDiffResult, 'additions' | 'deletions'> => {
  let additions = 0
  let deletions = 0

  for (const line of unifiedDiff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++
    if (line.startsWith('-') && !line.startsWith('---')) deletions++
  }

  return { additions, deletions }
}

const runDiff = async(repoRoot: string, args: string[]): Promise<string> => {
  try {
    const { stdout } = await runGit(args, { cwd: repoRoot })
    return stdout
  } catch (err) {
    if (err instanceof GitCommandError && err.exitCode === 1 && err.stdout) {
      return err.stdout
    }
    throw err
  }
}

const readHeadContent = async (repoRoot: string, rel: string): Promise<string> => {
  try {
    const { stdout } = await runGit(['show', `HEAD:${rel}`], { cwd: repoRoot })
    return stdout
  } catch (err) {
    if (err instanceof GitCommandError) return ''
    throw err
  }
}

const readWorkingContent = async (absPath: string): Promise<string> => {
  try {
    return await fs.readFile(absPath, 'utf8')
  } catch {
    return ''
  }
}

export const diffFile = async(repoRoot: string, filePath: string): Promise<FileDiffResult> => {
  const rel = filePath.replace(/\\/g, '/')
  const absPath = path.join(repoRoot, rel)

  let unifiedDiff = await runDiff(repoRoot, ['diff', 'HEAD', '--', rel])
  if (!unifiedDiff.trim()) {
    unifiedDiff = await runDiff(repoRoot, ['diff', '--no-index', '--', nullDevice, absPath])
  }

  const { additions, deletions } = countDiffStats(unifiedDiff)
  const [oldContent, newContent] = await Promise.all([
    readHeadContent(repoRoot, rel),
    readWorkingContent(absPath)
  ])

  return { unifiedDiff, additions, deletions, oldContent, newContent }
}
