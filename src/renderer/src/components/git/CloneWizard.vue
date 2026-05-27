<template>
  <el-dialog
    v-model="visible"
    :title="t('git.clone.title')"
    width="520px"
    destroy-on-close
    @closed="reset"
  >
    <el-steps
      :active="step"
      finish-status="success"
      align-center
      class="clone-steps"
    >
      <el-step :title="t('git.clone.stepUrl')" />
      <el-step :title="t('git.clone.stepToken')" />
      <el-step :title="t('git.clone.stepFolder')" />
    </el-steps>

    <div
      v-if="step === 0"
      class="step-body"
    >
      <p class="hint">
        {{ t('git.clone.urlHint') }}
      </p>
      <el-input
        v-model="url"
        :placeholder="t('git.clone.urlPlaceholder')"
      />
    </div>

    <div
      v-else-if="step === 1"
      class="step-body"
    >
      <p class="hint">
        {{ t('git.clone.tokenHint') }}
      </p>
      <el-input
        v-model="pat"
        type="password"
        show-password
        :placeholder="t('git.clone.tokenPlaceholder')"
      />
    </div>

    <div
      v-else
      class="step-body"
    >
      <p class="hint">
        {{ t('git.clone.folderHint') }}
      </p>
      <el-input
        v-model="destinationPath"
        :placeholder="t('git.clone.folderPlaceholder')"
      />
      <p
        v-if="progressText"
        class="progress"
      >
        {{ progressText }}
      </p>
    </div>

    <p
      v-if="errorMessage"
      class="error"
    >
      {{ errorMessage }}
    </p>

    <template #footer>
      <el-button
        v-if="step > 0 && !isCloning"
        @click="step--"
      >
        {{ t('git.clone.back') }}
      </el-button>
      <el-button
        v-if="step < 2"
        type="primary"
        :disabled="!canAdvance"
        @click="advance"
      >
        {{ t('git.clone.next') }}
      </el-button>
      <el-button
        v-else
        type="primary"
        :loading="isCloning"
        :disabled="!destinationPath.trim()"
        @click="clone"
      >
        {{ t('git.clone.connect') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useGitStore } from '@/store/git'
import { t } from '@/i18n'
import log from 'electron-log'

const gitStore = useGitStore()

const step = ref(0)
const url = ref('')
const pat = ref('')
const destinationPath = ref('')
const hostKey = ref('')
const normalizedUrl = ref('')
const errorMessage = ref<string | null>(null)
const isCloning = ref(false)
const progressText = ref('')

const visible = computed({
  get: () => gitStore.showCloneWizard,
  set: (value: boolean) => {
    gitStore.showCloneWizard = value
  }
})

const canAdvance = computed(() => {
  if (step.value === 0) return url.value.trim().length > 0
  if (step.value === 1) return pat.value.trim().length > 0
  return true
})

let progressUnsubscribe: (() => void) | null = null

const reset = (): void => {
  step.value = 0
  url.value = ''
  pat.value = ''
  destinationPath.value = ''
  errorMessage.value = null
  progressText.value = ''
  isCloning.value = false
}

const advance = async (): Promise<void> => {
  errorMessage.value = null
  if (step.value === 0) {
    try {
      const parsed = await window.git.normalizeUrl(url.value.trim())
      normalizedUrl.value = parsed.url
      hostKey.value = parsed.hostKey
      if (parsed.repoName) {
        const home = await guessDocumentsPath()
        destinationPath.value = window.path.join(home, 'MarkText', parsed.repoName)
      }
      step.value++
    } catch (err) {
      errorMessage.value = formatError(err)
    }
    return
  }
  step.value++
}

const guessDocumentsPath = async (): Promise<string> => {
  const home = window.electron.process.env.HOME || window.electron.process.env.USERPROFILE || ''
  return window.path.join(home, 'Documents')
}

const clone = async (): Promise<void> => {
  errorMessage.value = null
  isCloning.value = true
  progressText.value = t('git.clone.cloning')

  progressUnsubscribe?.()
  progressUnsubscribe = window.git.onProgress((event) => {
    if (event.phase) {
      progressText.value = event.phase
    }
  })

  try {
    const result = await window.git.clone({
      url: normalizedUrl.value || url.value.trim(),
      destinationPath: destinationPath.value.trim(),
      pat: pat.value.trim(),
      depth: 1
    })

    visible.value = false
    const { windowId } = window.marktext?.env ?? { windowId: -1 }
    window.electron.ipcRenderer.send(
      'app-open-directory-by-id',
      Number(windowId),
      result.repoRoot,
      true
    )
    await gitStore.initForProject(result.repoRoot)
  } catch (err) {
    errorMessage.value = formatError(err)
    log.error('[clone wizard]', err)
  } finally {
    isCloning.value = false
    progressUnsubscribe?.()
    progressUnsubscribe = null
  }
}

const formatError = (err: unknown): string => {
  if (err instanceof Error && err.message) {
    return err.message
  }
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: string }).message)
  }
  return t('git.errors.unknown')
}

watch(visible, (open) => {
  if (open) reset()
})

onUnmounted(() => {
  progressUnsubscribe?.()
})
</script>

<style scoped>
.clone-steps {
  margin-bottom: 1.5rem;
}
.step-body {
  min-height: 120px;
}
.hint {
  color: var(--editorColor50);
  font-size: 13px;
  margin-bottom: 12px;
}
.error {
  color: var(--deleteColor);
  margin-top: 12px;
  font-size: 13px;
}
.progress {
  margin-top: 12px;
  font-size: 12px;
  color: var(--editorColor50);
}
</style>
