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
      v-if="gitStore.branch && gitStore.isRepo"
      class="branch-line"
    >
      <span class="branch-prefix">{{ t('sideBar.git.workingOnPrefix') }}</span>
      <el-popover
        v-model:visible="branchPickerVisible"
        placement="bottom-start"
        :width="220"
        trigger="click"
        popper-class="git-branch-popover"
        @show="onBranchPickerShow"
      >
        <template #reference>
          <el-button
            class="branch-button"
            text
            bg
            :aria-label="t('sideBar.git.switchBranch')"
          >
            {{ gitStore.branch }}
            <el-icon class="branch-chevron">
              <ArrowDown />
            </el-icon>
          </el-button>
        </template>
        <div class="branch-picker">
          <div
            v-if="gitStore.isBranchPickerLoading"
            class="branch-picker-loading"
          >
            {{ t('sideBar.git.loadingBranches') }}
          </div>
          <ul
            v-else-if="gitStore.branches.length"
            class="branch-list"
          >
            <li
              v-for="branch in gitStore.branches"
              :key="branch.name"
              class="branch-item"
              :class="{ current: branch.current }"
            >
              <button
                type="button"
                class="branch-item-button"
                :disabled="branch.current || gitStore.isLoading"
                @click="selectBranch(branch.name)"
              >
                {{ branch.name }}
              </button>
            </li>
          </ul>
          <div
            v-else
            class="branch-picker-empty"
          >
            {{ t('sideBar.git.branchSwitchFailed') }}
          </div>
        </div>
      </el-popover>
    </div>

    <div
      v-if="showNoFolder"
      class="empty-state"
    >
      <p>{{ t('sideBar.git.noFolderOpen') }}</p>
      <div class="empty-state-actions">
        <el-button
          type="primary"
          text
          bg
          @click="openFolder"
        >
          {{ t('sideBar.git.openExistingFolder') }}
        </el-button>
        <el-button
          type="primary"
          text
          bg
          @click="gitStore.showCloneWizard = true"
        >
          {{ t('sideBar.git.cloneProject') }}
        </el-button>
      </div>
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

      <div class="section-header">
        <h6 class="section-title">
          {{ changesTitle }}
        </h6>
        <el-tooltip
          :content="t('sideBar.git.refresh')"
          placement="top"
          :show-after="500"
        >
          <el-button
            class="refresh-btn"
            size="small"
            text
            :loading="gitStore.isLoading"
            @click="refreshChanges"
          >
            <el-icon :size="14">
              <RefreshRight />
            </el-icon>
          </el-button>
        </el-tooltip>
      </div>

      <ul
        v-if="gitStore.changedFiles.length"
        class="file-list"
      >
        <li
          v-for="file in gitStore.changedFiles"
          :key="file.path"
          class="file-row"
        >
          <el-tooltip
            :content="t('sideBar.git.discardChange')"
            placement="top"
            :show-after="500"
          >
            <button
              type="button"
              class="discard-btn"
              :disabled="gitStore.isLoading"
              @click.stop="discardFile(file)"
            >
              <el-icon :size="14">
                <Delete />
              </el-icon>
            </button>
          </el-tooltip>
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
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useGitStore } from '@/store/git'
import { useProjectStore } from '@/store/project'
import { useLayoutStore } from '@/store/layout'
import type { GitChangedFile } from '@shared/types/git'
import { t } from '@/i18n'
import { RefreshRight, Delete, ArrowDown } from '@element-plus/icons-vue'
import Loading from '@/components/loading/index.vue'

const gitStore = useGitStore()
const projectStore = useProjectStore()
const layoutStore = useLayoutStore()
const { projectTree } = storeToRefs(projectStore)
const { rightColumn } = storeToRefs(layoutStore)
const branchPickerVisible = ref(false)

const showNoFolder = computed(() => !projectTree.value?.pathname)

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
  return null
})

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

const refreshChanges = (): void => {
  gitStore.refresh(undefined, { fetch: true }).catch(() => {})
}

const discardFile = (file: GitChangedFile): void => {
  gitStore.discardChanges(file.path, file.kind).catch(() => {})
}

const onBranchPickerShow = (): void => {
  gitStore.loadBranches().catch(() => {})
}

const selectBranch = (branchName: string): void => {
  gitStore.switchBranch(branchName).then((success) => {
    if (success) {
      branchPickerVisible.value = false
    }
  })
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
  padding: 37px 12px 12px;
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
.sync-banner p {
  margin: 0 0 8px;
}
.branch-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}
.branch-prefix {
  color: var(--sideBarTextColor, var(--editorColor));
}
.branch-line :deep(.branch-button.el-button.is-text.is-has-bg) {
  background-color: var(--itemBgColor);
  color: var(--themeColor);
  border-color: transparent;
  box-shadow: none;
}
.branch-line :deep(.branch-button.el-button.is-text.is-has-bg:hover),
.branch-line :deep(.branch-button.el-button.is-text.is-has-bg:focus) {
  background-color: var(--floatHoverColor);
  color: var(--themeColor);
}
.branch-button {
  font-size: 13px;
  font-weight: 600;
  padding: 2px 8px;
  height: auto;
}
.branch-chevron {
  margin-left: 2px;
}
.empty-state,
.empty-changes {
  color: var(--editorColor50);
  font-size: 13px;
  text-align: center;
  margin-top: 24px;
}
.empty-state-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--editorColor50);
  margin: 0;
  flex: 1;
}
.refresh-btn {
  flex-shrink: 0;
  padding: 4px;
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
.review-btn {
  background: none;
  border: none;
  color: var(--themeColor);
  cursor: pointer;
  font-size: 11px;
  padding: 4px;
}
.discard-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--editorColor50);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  flex-shrink: 0;
}
.discard-btn:hover:not(:disabled) {
  color: #f85149;
  background: var(--itemHoverBgColor);
}
.discard-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
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

<style>
/* Popover is teleported to body — theme it globally like other float panels. */
.git-branch-popover.el-popper {
  background: var(--floatBgColor) !important;
  border: 1px solid var(--floatBorderColor) !important;
  box-shadow: 0 4px 8px 0 var(--floatBorderColor);
  padding: 4px 0 !important;
  min-width: 180px;
}

.git-branch-popover.el-popper .el-popper__arrow::before {
  background: var(--floatBgColor) !important;
  border: 1px solid var(--floatBorderColor) !important;
}

.git-branch-popover .branch-picker {
  min-width: 180px;
}

.git-branch-popover .branch-picker-loading,
.git-branch-popover .branch-picker-empty {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--floatFontColor);
}

.git-branch-popover .branch-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 200px;
  overflow-y: auto;
}

.git-branch-popover .branch-item-button {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  color: var(--editorColor);
}

.git-branch-popover .branch-item-button:hover:not(:disabled) {
  background: var(--floatHoverColor);
}

.git-branch-popover .branch-item-button:disabled {
  cursor: default;
  opacity: 0.85;
}

.git-branch-popover .branch-item.current .branch-item-button {
  font-weight: 600;
  color: var(--themeColor);
}
</style>
