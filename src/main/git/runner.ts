import { spawn } from 'child_process'
import commandExists from 'command-exists'
import { isFile2 } from 'common/filesystem'
import { authConfigArgs } from './auth'

const gitCommand = 'git'

export const getGitCommand = (): string => {
  if (process.env.MARKTEXT_GIT && isFile2(process.env.MARKTEXT_GIT)) {
    return process.env.MARKTEXT_GIT
  }
  return gitCommand
}

export const gitExists = (): boolean => {
  if (process.env.MARKTEXT_GIT && isFile2(process.env.MARKTEXT_GIT)) return true
  return commandExists.sync(gitCommand)
}

export class GitCommandError extends Error {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null

  constructor(message: string, stdout: string, stderr: string, exitCode: number | null) {
    super(message)
    this.stdout = stdout
    this.stderr = stderr
    this.exitCode = exitCode
  }
}

export interface RunGitOptions {
  cwd?: string
  auth?: { hostKey: string }
  extraConfigArgs?: string[]
  stdin?: string
  onStderr?: (chunk: string) => void
}

export interface RunGitResult {
  stdout: string
  stderr: string
}

const assertGitAvailable = (): void => {
  if (!gitExists()) {
    throw new Error('git_not_found')
  }
}

export const runGit = async(args: string[], options: RunGitOptions = {}): Promise<RunGitResult> => {
  assertGitAvailable()

  const command = getGitCommand()
  const configArgs = [
    ...(options.extraConfigArgs ?? []),
    ...(options.auth ? await authConfigArgs(options.auth.hostKey) : [])
  ]
  const fullArgs = [...configArgs, ...args]

  return new Promise((resolve, reject) => {
    const proc = spawn(command, fullArgs, {
      cwd: options.cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: [options.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe']
    })

    if (options.stdin && proc.stdin) {
      proc.stdin.write(options.stdin)
      proc.stdin.end()
    }

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })

    proc.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stderr += text
      options.onStderr?.(text)
    })

    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('git_not_found'))
        return
      }
      reject(err)
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new GitCommandError(stderr.trim() || stdout.trim() || `git exited with code ${code}`, stdout, stderr, code))
    })
  })
}
