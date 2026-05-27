<template>
  <div class="side-bar-git">
    <div
      v-if="syncBanner"
      class="sync-banner"
      :class="syncBanner.type"
    >
      <p>{{ syncBanner.message }}</p>
      <el-button
        v-if="syncBanner.showPull"
        size="small"
        type="primary"
        :loading="gitStore.isLoading"
        @click="gitStore.pullLatest()"
      >
        {{ t('sideBar.git.getLatest') }}
      </el-button>
    </div>

    <div
      v-if="branchLabel"
      class="branch-line"
    >
      {{ branchLabel }}
    </div>

    <div
      v-if="showNoFolder"
      class="empty-state"
    >
      <p>{{ t('sideBar.git.noFolderOpen') }}</p>
      <el-button
        type="primary"
        text
        bg
        @click="openFolder"
      >
        {{ t('sideBar.git.openFolder') }}
      </el-button>
    </div>

    <div
      v-else-if="!gitStore.isRepo"
      class="empty-state"
    >
      <p>{{ t('sideBar.git.notConnected') }}</p>
      <el-button
        type="primary"
        text
        bg
        @click="gitStore.showCloneWizard = true"
      >
        {{ t('sideBar.git.connect') }}
      </el-button>
    </div>

    <div
      v-else
      class="changes-section"
    >
      <div
        v-if="gitStore.lastError"
        class="error-banner"
      >
        {{ gitStore.lastError }}
      </div>

      <div
        v-if="gitStore.conflictFiles.length"
        class="conflict-banner"
      >
        <p>{{ t('sideBar.git.conflictMessage') }}</p>
        <ul>
          <li
            v-for="file in gitStore.conflictFiles"
            :key="file"
          >
            {{ file }}
          </li>
        </ul>
      </div>

      <h6 class="section-title">
        {{ changesTitle }}
      </h6>

      <ul
        v-if="gitStore.changedFiles.length"
        class="file-list"
      >
        <li
          v-for="file in gitStore.changedFiles"
          :key="file.path"
          class="file-row"
        >
          <button
            type="button"
            class="file-open"
            @click="openFile(file.path)"
          >
            <span
              class="kind"
              :class="file.kind"
            />
            <span class="name">{{ file.path }}</span>
            <span class="label">{{ changeLabel(file) }}</span>
          </button>
          <button
            type="button"
            class="review-btn"
            :title="t('sideBar.git.reviewChange')"
            @click="gitStore.openDiff(file.path)"
          >
            {{ t('sideBar.git.review') }}
          </button>
        </li>
      </ul>

      <p
        v-else
        class="empty-changes"
      >
        {{ t('sideBar.git.noChanges') }}
      </p>

      <div class="actions">
        <el-button
          size="small"
          :disabled="!gitStore.changedFiles.length"
          @click="reviewFirst"
        >
          {{ t('sideBar.git.reviewAll') }}
        </el-button>
        <el-button
          size="small"
          type="primary"
          :disabled="!gitStore.changedFiles.length"
          :loading="gitStore.isLoading"
          @click="gitStore.showCommitDialog = true"
        >
          {{ t('sideBar.git.share') }}
        </el-button>
      </div>
    </div>

    <loading v-if="gitStore.isLoading && gitStore.isRepo" />
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useGitStore } from '@/store/git'
import { useProjectStore } from '@/store/project'
import { useLayoutStore } from '@/store/layout'
import type { GitChangedFile } from '@shared/types/git'
import { t } from '@/i18n'
import Loading from '@/components/loading/index.vue'

const gitStore = useGitStore()
const projectStore = useProjectStore()
const layoutStore = useLayoutStore()
const { projectTree } = storeToRefs(projectStore)
const { rightColumn } = storeToRefs(layoutStore)

const showNoFolder = computed(() => !projectTree.value?.pathname)

const branchLabel = computed(() => {
  if (!gitStore.branch) return ''
  return t('sideBar.git.workingOn', { branch: gitStore.branch })
})

const changesTitle = computed(() => {
  return t('sideBar.git.yourChanges', { count: gitStore.changedFiles.length })
})

const syncBanner = computed(() => {
  const sync = gitStore.syncStatus
  if (!sync) return null

  if (sync.behind > 0) {
    return {
      type: 'behind',
      message: t('sideBar.git.teamChanges', { count: sync.behind }),
      showPull: true
    }
  }
  if (sync.ahead > 0) {
    return {
      type: 'ahead',
      message: t('sideBar.git.unsharedSnapshots', { count: sync.ahead }),
      showPull: false
    }
  }
  return {
    type: 'ok',
    message: t('sideBar.git.upToDate'),
    showPull: false
  }
})

const changeLabel = (file: GitChangedFile): string => {
  if (file.kind === 'added') return t('sideBar.git.changeAdded')
  if (file.kind === 'deleted') return t('sideBar.git.changeDeleted')
  return t('sideBar.git.changeModified')
}

const openFolder = (): void => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const openFile = (relPath: string): void => {
  const root = gitStore.repoRoot || projectTree.value?.pathname
  if (!root) return
  const fullPath = window.path.join(root, relPath)
  window.electron.ipcRenderer.send('mt::open-file', fullPath)
}

const reviewFirst = (): void => {
  const first = gitStore.changedFiles[0]
  if (first) gitStore.openDiff(first.path)
}

watch(rightColumn, (column) => {
  if (column === 'git') {
    gitStore.refresh().catch(() => {})
    gitStore.startPolling(gitStore.FETCH_INTERVAL_VISIBLE_MS)
  } else if (gitStore.isRepo) {
    gitStore.startPolling(5 * 60 * 1000)
  }
})

onMounted(() => {
  gitStore.refresh().catch(() => {})
})

onUnmounted(() => {
  gitStore.stopPolling()
})
</script>

<style scoped>
.side-bar-git {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
  position: relative;
}
.sync-banner {
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 13px;
}
.sync-banner.behind {
  background: rgba(210, 153, 34, 0.15);
  border: 1px solid rgba(210, 153, 34, 0.35);
}
.sync-banner.ahead {
  background: rgba(56, 139, 253, 0.12);
  border: 1px solid rgba(56, 139, 253, 0.3);
}
.sync-banner.ok {
  background: rgba(63, 185, 80, 0.12);
  border: 1px solid rgba(63, 185, 80, 0.3);
}
.sync-banner p {
  margin: 0 0 8px;
}
.branch-line {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}
.empty-state,
.empty-changes {
  color: var(--editorColor50);
  font-size: 13px;
  text-align: center;
  margin-top: 24px;
}
.section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--editorColor50);
  margin: 0 0 8px;
}
.file-list {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  overflow-y: auto;
  flex: 1;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}
.file-open {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
  padding: 6px 4px;
  border-radius: 4px;
  font-size: 12px;
}
.file-open:hover {
  background: var(--itemHoverBgColor);
}
.kind {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.kind.modified {
  background: #d29922;
}
.kind.added {
  background: #3fb950;
}
.kind.deleted {
  background: #f85149;
}
.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.label {
  color: var(--editorColor50);
  font-size: 11px;
}
.review-btn {
  background: none;
  border: none;
  color: var(--themeColor);
  cursor: pointer;
  font-size: 11px;
  padding: 4px;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 8px;
}
.error-banner,
.conflict-banner {
  background: rgba(248, 81, 73, 0.12);
  border: 1px solid rgba(248, 81, 73, 0.3);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  margin-bottom: 10px;
}
.conflict-banner ul {
  margin: 6px 0 0;
  padding-left: 16px;
}
.changes-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
</style>
