<template>
  <el-dialog
    v-model="visible"
    :title="t('git.commit.title')"
    width="480px"
    destroy-on-close
  >
    <p class="hint">
      {{ t('git.commit.hint') }}
    </p>
    <el-input
      v-model="message"
      type="textarea"
      :rows="4"
      :placeholder="t('git.commit.placeholder')"
    />
    <template #footer>
      <el-button @click="visible = false">
        {{ t('git.commit.cancel') }}
      </el-button>
      <el-button
        type="primary"
        :loading="gitStore.isLoading"
        :disabled="!message.trim()"
        @click="submit"
      >
        {{ t('git.commit.share') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useGitStore } from '@/store/git'
import { t } from '@/i18n'
import notice from '@/services/notification'

const gitStore = useGitStore()
const message = ref('')

const visible = computed({
  get: () => gitStore.showCommitDialog,
  set: (value: boolean) => {
    gitStore.showCommitDialog = value
  }
})

const submit = async (): Promise<void> => {
  const ok = await gitStore.publish(message.value.trim())
  if (ok) {
    notice.notify({
      title: t('git.commit.successTitle'),
      message: t('git.commit.successMessage'),
      type: 'primary',
      time: 2500
    })
    message.value = ''
  }
}

watch(visible, (open) => {
  if (open) message.value = ''
})
</script>

<style scoped>
.hint {
  color: var(--editorColor50);
  font-size: 13px;
  margin-bottom: 12px;
}
</style>
