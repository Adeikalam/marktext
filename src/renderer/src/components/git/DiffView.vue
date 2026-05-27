<template>
  <el-dialog
    v-model="visible"
    :title="diffTitle"
    width="720px"
    destroy-on-close
    class="git-diff-dialog"
    @closed="onClose"
  >
    <p
      v-if="summary"
      class="summary"
    >
      {{ summary }}
    </p>
    <pre class="diff-content"><code>{{ diffText }}</code></pre>
    <template #footer>
      <el-button @click="visible = false">
        {{ t('git.diff.close') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGitStore } from '@/store/git'
import { t } from '@/i18n'

const gitStore = useGitStore()

const visible = computed({
  get: () => gitStore.showDiff,
  set: (value: boolean) => {
    if (!value) gitStore.closeDiff()
  }
})

const diffText = computed(() => gitStore.diffResult?.unifiedDiff ?? '')
const diffTitle = computed(() => gitStore.diffResult?.path ?? t('git.diff.title'))

const summary = computed(() => {
  const diff = gitStore.diffResult
  if (!diff) return ''
  return t('git.diff.summary', { added: diff.additions, removed: diff.deletions })
})

const onClose = (): void => {
  gitStore.closeDiff()
}
</script>

<style scoped>
.summary {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--editorColor50);
}
.diff-content {
  max-height: 60vh;
  overflow: auto;
  background: var(--editorBgColor);
  border: 1px solid var(--borderColor);
  border-radius: 4px;
  padding: 12px;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
