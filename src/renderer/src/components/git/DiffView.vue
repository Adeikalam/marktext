<template>
  <el-dialog
    v-model="visible"
    width="min(1100px, 92vw)"
    destroy-on-close
    class="git-diff-dialog"
    @closed="onClose"
  >
    <template #header>
      <div class="diff-header">
        <span
          class="diff-filename"
          :title="diffTitle"
        >{{ diffTitle }}</span>
      </div>
    </template>
    <p
      v-if="summary"
      class="summary"
    >
      <template v-if="summaryHasColoredParts">
        <span class="summary-added">{{ additions }}</span>{{ summaryBetweenCounts }}<span class="summary-removed">{{ deletions }}</span>{{ summaryAfterRemoved }}
      </template>
      <template v-else>
        {{ summary }}
      </template>
    </p>
    <div class="diff-split">
      <div class="diff-pane-wrap">
        <div
          ref="oldPaneRef"
          class="diff-pane"
          @scroll="onPaneScroll('old', $event)"
        >
          <div
            v-for="(row, i) in alignedRows"
            :key="`old-${i}`"
            class="diff-row"
            :class="oldRowClass(row)"
          >
            <span class="diff-gutter">{{ row.oldLineNumber ?? '' }}</span>
            <span class="diff-code">
              <template v-if="row.oldText === null">&nbsp;</template>
              <template v-else-if="row.kind === 'change' && row.oldSegments">
                <template
                  v-for="(seg, j) in row.oldSegments"
                  :key="j"
                ><span :class="{ 'diff-chunk--del': seg.type === 'change' }">{{ seg.text }}</span></template>
              </template>
              <template v-else>{{ row.oldText }}</template>
            </span>
          </div>
        </div>
        <div
          class="diff-scrollbar-overview"
          aria-hidden="true"
        >
          <div
            class="diff-scrollbar-viewport"
            :style="viewportStyle"
          />
          <button
            v-for="mark in oldScrollbarMarks"
            :key="`old-mark-${mark.rowIndex}-${mark.kind}`"
            type="button"
            class="diff-scrollbar-mark"
            :class="`diff-scrollbar-mark--${mark.kind}`"
            :style="scrollbarMarkStyle(mark.rowIndex, alignedRows.length)"
            :title="t('git.diff.scrollToChange')"
            @click="scrollToRow(mark.rowIndex)"
          />
        </div>
      </div>
      <div class="diff-pane-wrap">
        <div
          ref="newPaneRef"
          class="diff-pane"
          @scroll="onPaneScroll('new', $event)"
        >
          <div
            v-for="(row, i) in alignedRows"
            :key="`new-${i}`"
            class="diff-row"
            :class="newRowClass(row)"
          >
            <span class="diff-gutter">{{ row.newLineNumber ?? '' }}</span>
            <span class="diff-code">
              <template v-if="row.newText === null">&nbsp;</template>
              <template v-else-if="row.kind === 'change' && row.newSegments">
                <template
                  v-for="(seg, j) in row.newSegments"
                  :key="j"
                ><span :class="{ 'diff-chunk--add': seg.type === 'change' }">{{ seg.text }}</span></template>
              </template>
              <template v-else>{{ row.newText }}</template>
            </span>
          </div>
        </div>
        <div
          class="diff-scrollbar-overview"
          aria-hidden="true"
        >
          <div
            class="diff-scrollbar-viewport"
            :style="viewportStyle"
          />
          <button
            v-for="mark in newScrollbarMarks"
            :key="`new-mark-${mark.rowIndex}-${mark.kind}`"
            type="button"
            class="diff-scrollbar-mark"
            :class="`diff-scrollbar-mark--${mark.kind}`"
            :style="scrollbarMarkStyle(mark.rowIndex, alignedRows.length)"
            :title="t('git.diff.scrollToChange')"
            @click="scrollToRow(mark.rowIndex)"
          />
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">
        {{ t('git.diff.close') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useGitStore } from '@/store/git'
import { t } from '@/i18n'
import { DEFAULT_CODE_FONT_FAMILY } from '@/config'
import {
  buildAlignedLineDiff,
  DIFF_VIEW_LINE_HEIGHT_PX,
  newPaneScrollbarMarks,
  oldPaneScrollbarMarks,
  scrollbarMarkStyle,
  type AlignedDiffRow
} from '@/util/gitLineDiff'

const codeFontFamily = DEFAULT_CODE_FONT_FAMILY

const gitStore = useGitStore()
const oldPaneRef = ref<HTMLElement | null>(null)
const newPaneRef = ref<HTMLElement | null>(null)
const syncingScroll = ref(false)
const paneScrollTop = ref(0)
const paneViewportHeight = ref(0)

const visible = computed({
  get: () => gitStore.showDiff,
  set: (value: boolean) => {
    if (!value) gitStore.closeDiff()
  }
})

const diffTitle = computed(() => gitStore.diffResult?.path ?? t('git.diff.title'))

const alignedRows = computed(() => {
  const diff = gitStore.diffResult
  if (!diff) return []
  return buildAlignedLineDiff(diff.oldContent, diff.newContent)
})

const oldScrollbarMarks = computed(() => oldPaneScrollbarMarks(alignedRows.value))
const newScrollbarMarks = computed(() => newPaneScrollbarMarks(alignedRows.value))

const contentHeightPx = computed(() => alignedRows.value.length * DIFF_VIEW_LINE_HEIGHT_PX)

const viewportStyle = computed(() => {
  const total = contentHeightPx.value
  if (total <= 0 || paneViewportHeight.value <= 0) {
    return { display: 'none' }
  }
  const topPercent = (paneScrollTop.value / total) * 100
  const heightPercent = Math.min((paneViewportHeight.value / total) * 100, 100)
  return {
    top: `${topPercent}%`,
    height: `${heightPercent}%`
  }
})

const additions = computed(() => gitStore.diffResult?.additions ?? 0)
const deletions = computed(() => gitStore.diffResult?.deletions ?? 0)

const summary = computed(() => {
  const diff = gitStore.diffResult
  if (!diff) return ''
  return t('git.diff.summary', { added: diff.additions, removed: diff.deletions })
})

const summaryHasColoredParts = computed(() => {
  const diff = gitStore.diffResult
  if (!diff) return false
  const full = t('git.diff.summary', { added: diff.additions, removed: diff.deletions })
  const addedStr = String(diff.additions)
  const removedStr = String(diff.deletions)
  const addedIdx = full.indexOf(addedStr)
  const removedIdx = full.indexOf(removedStr)
  return addedIdx !== -1 && removedIdx !== -1 && removedIdx > addedIdx
})

const summaryBetweenCounts = computed(() => {
  const diff = gitStore.diffResult
  if (!diff) return ''
  const full = t('git.diff.summary', { added: diff.additions, removed: diff.deletions })
  const addedStr = String(diff.additions)
  const removedStr = String(diff.deletions)
  const addedIdx = full.indexOf(addedStr)
  const removedIdx = full.indexOf(removedStr)
  return full.slice(addedIdx + addedStr.length, removedIdx)
})

const summaryAfterRemoved = computed(() => {
  const diff = gitStore.diffResult
  if (!diff) return ''
  const full = t('git.diff.summary', { added: diff.additions, removed: diff.deletions })
  const removedStr = String(diff.deletions)
  const removedIdx = full.indexOf(removedStr)
  if (removedIdx === -1) return ''
  return full.slice(removedIdx + removedStr.length)
})

const oldRowClass = (row: AlignedDiffRow): Record<string, boolean> => ({
  'diff-row--equal': row.kind === 'equal',
  'diff-row--del': row.kind === 'delete' || row.kind === 'change',
  'diff-row--empty': row.oldText === null
})

const newRowClass = (row: AlignedDiffRow): Record<string, boolean> => ({
  'diff-row--equal': row.kind === 'equal',
  'diff-row--add': row.kind === 'insert' || row.kind === 'change',
  'diff-row--empty': row.newText === null
})

const updateScrollMetrics = (el: HTMLElement): void => {
  paneScrollTop.value = el.scrollTop
  paneViewportHeight.value = el.clientHeight
}

const syncScroll = (source: 'old' | 'new', target: HTMLElement): void => {
  if (syncingScroll.value) return
  const other = source === 'old' ? newPaneRef.value : oldPaneRef.value
  if (!other || other.scrollTop === target.scrollTop) return
  syncingScroll.value = true
  other.scrollTop = target.scrollTop
  window.setTimeout(() => {
    syncingScroll.value = false
  }, 0)
}

const onPaneScroll = (source: 'old' | 'new', event: Event): void => {
  const target = event.target as HTMLElement
  updateScrollMetrics(target)
  syncScroll(source, target)
}

const scrollToRow = (rowIndex: number): void => {
  const pane = oldPaneRef.value ?? newPaneRef.value
  if (!pane) return
  const top = rowIndex * DIFF_VIEW_LINE_HEIGHT_PX
  const scrollTop = Math.max(0, top - pane.clientHeight * 0.25)
  syncingScroll.value = true
  if (oldPaneRef.value) oldPaneRef.value.scrollTop = scrollTop
  if (newPaneRef.value) newPaneRef.value.scrollTop = scrollTop
  updateScrollMetrics(pane)
  window.setTimeout(() => {
    syncingScroll.value = false
  }, 0)
}

const onClose = (): void => {
  gitStore.closeDiff()
}

watch([visible, alignedRows], () => {
  if (!visible.value) return
  nextTick(() => {
    const pane = oldPaneRef.value
    if (pane) updateScrollMetrics(pane)
  })
})
</script>

<style scoped>
.diff-header {
  padding-right: 24px;
}
.diff-filename {
  display: block;
  font-family: v-bind(codeFontFamily);
  font-size: 14px;
  font-weight: 600;
  color: var(--editorColor80);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--editorColor50);
}
.summary-added {
  color: var(--gitDiffAddColor);
  font-weight: 600;
}
.summary-removed {
  color: var(--gitDiffDelColor);
  font-weight: 600;
}
.diff-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: minmax(0, 1fr);
  height: 65vh;
  max-height: 65vh;
  border: 1px solid var(--editorColor10);
  border-radius: 4px;
  overflow: hidden;
  background: var(--codeBlockBgColor);
}
.diff-pane-wrap {
  display: flex;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.diff-pane-wrap + .diff-pane-wrap {
  border-left: 1px solid var(--editorColor10);
}
.diff-pane {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
  font-family: v-bind(codeFontFamily);
  font-size: 12px;
  line-height: 20px;
}
.diff-scrollbar-overview {
  position: relative;
  flex: 0 0 12px;
  background: var(--editorColor04);
  border-left: 1px solid var(--editorColor10);
}
.diff-scrollbar-viewport {
  position: absolute;
  left: 1px;
  right: 1px;
  background: var(--editorColor10);
  border-radius: 2px;
  pointer-events: none;
  z-index: 0;
}
.diff-scrollbar-mark {
  position: absolute;
  left: 2px;
  right: 2px;
  min-height: 4px;
  padding: 0;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  z-index: 1;
  opacity: 0.95;
}
.diff-scrollbar-mark:hover {
  opacity: 1;
  filter: brightness(1.1);
}
.diff-scrollbar-mark--del {
  background: var(--gitDiffDelColor);
}
.diff-scrollbar-mark--add {
  background: var(--gitDiffAddColor);
}
.diff-scrollbar-mark--change {
  background: linear-gradient(
    to bottom,
    var(--gitDiffDelColor) 0%,
    var(--gitDiffDelColor) 50%,
    var(--gitDiffAddColor) 50%,
    var(--gitDiffAddColor) 100%
  );
}
.diff-row {
  display: flex;
  min-height: 20px;
  color: var(--editorColor);
}
.diff-row--equal {
  background: transparent;
}
.diff-row--del {
  background: var(--gitDiffDelBg);
}
.diff-row--add {
  background: var(--gitDiffAddBg);
}
.diff-row--empty {
  background: var(--editorColor04);
}
.diff-gutter {
  flex: 0 0 44px;
  padding: 0 8px;
  text-align: right;
  color: var(--editorColor40);
  user-select: none;
  border-right: 1px solid var(--editorColor04);
}
.diff-code {
  flex: 1;
  min-width: 0;
  padding: 0 12px;
  white-space: pre;
  overflow-x: auto;
}
.diff-chunk--del {
  color: var(--gitDiffDelColor);
  background: rgba(248, 81, 73, 0.28);
  border-radius: 2px;
}
.diff-chunk--add {
  color: var(--gitDiffAddColor);
  background: rgba(63, 185, 80, 0.28);
  border-radius: 2px;
}
</style>

<style>
.git-diff-dialog .el-dialog__body {
  overflow: visible;
}
.git-diff-dialog .el-dialog__headerbtn .el-dialog__close {
  color: var(--editorColor50);
}
.git-diff-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: var(--editorColor80);
}
</style>
