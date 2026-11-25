<template>
  <div class="inline-mail-search">
    <div class="search-row search-row-top">
      <div class="search-row-top-left">
        <div class="pill-group">
          <span class="pill-group-label">{{ t('searchType') }}</span>
          <div class="segmented-pills" role="radiogroup" :aria-label="t('searchType')">
            <button
              v-for="option in searchOptions"
              :key="option.type"
              type="button"
              class="pill-item"
              :class="{ active: searchType === option.type }"
              role="radio"
              :aria-checked="searchType === option.type"
              @click="selectSearchType(option.type)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div v-if="showSearchStatus" class="pill-group">
          <span class="pill-group-label">{{ t('mailStatus') }}</span>
          <div class="segmented-pills" role="radiogroup" :aria-label="t('mailStatus')">
            <button
              v-for="option in statusOptions"
              :key="option.value"
              type="button"
              class="pill-item"
              :class="{ active: mailStatus === option.value }"
              role="radio"
              :aria-checked="mailStatus === option.value"
              @click="selectStatus(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="$slots['row1-right']" class="search-row-top-right">
        <slot name="row1-right" />
      </div>
    </div>

    <div class="search-row search-row-bottom">
      <div v-if="$slots['row2-left']" class="row2-left">
        <slot name="row2-left" />
      </div>
      <span v-if="$slots['row2-left']" class="toolbar-divider" aria-hidden="true" />

      <div class="search-controls">
        <el-input
          ref="inputRef"
          v-model="searchText"
          class="search-keyword-input"
          clearable
          autocomplete="off"
          :placeholder="searchPlaceholder"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        >
          <template #prefix>
            <Icon icon="iconoir:search" width="15" height="15" class="input-prefix-icon" />
          </template>
        </el-input>

        <el-date-picker
          v-model="dateRange"
          class="search-date-picker"
          type="daterange"
          unlink-panels
          clearable
          :editable="false"
          value-format="YYYY-MM-DD"
          :range-separator="t('to')"
          :start-placeholder="t('searchStartDate')"
          :end-placeholder="t('searchEndDate')"
          popper-class="inline-mail-date-popper"
          @change="handleSearch"
        />

        <div class="search-btn-group">
          <el-button type="primary" class="search-action-btn" @click="handleSearch">
            {{ t('search') }}
          </el-button>
          <el-button class="search-action-btn" :disabled="!hasActiveFilter" @click="handleReset">
            {{ t('reset') }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {computed, nextTick, ref, watch} from 'vue'
import {Icon} from '@iconify/vue'
import {useI18n} from 'vue-i18n'

const {t} = useI18n()

const props = defineProps({
  searchStore: {
    type: Object,
    required: true,
  },
  searchOptions: {
    type: Array,
    required: true,
  },
  showSearchStatus: {
    type: Boolean,
    default: false,
  },
})

const inputRef = ref(null)
const searchText = ref('')
const searchType = ref('subject')
const mailStatus = ref('all')
const dateRange = ref(null)

const defaultSearchType = computed(() => props.searchOptions[0]?.type || 'subject')

const statusOptions = computed(() => [
  {label: t('all'), value: 'all'},
  {label: t('emailReceived'), value: 'receive'},
  {label: t('emailSent'), value: 'send'},
  {label: t('selectDeleted'), value: 'delete'},
  {label: t('noRecipient'), value: 'noone'},
])

const selectedSearchOption = computed(() =>
  props.searchOptions.find(option => option.type === searchType.value)
)

const searchPlaceholder = computed(() =>
  t('searchMailBy', {field: selectedSearchOption.value?.label || t('subject')})
)

const hasActiveFilter = computed(() => {
  const storeParams = props.searchStore?.searchParams || {}
  const hasLocalDate = Array.isArray(dateRange.value) && Boolean(dateRange.value[0] || dateRange.value[1])
  const hasStoreDate = Boolean(storeParams.startDate || storeParams.endDate)
  const hasStatusFilter = props.showSearchStatus && (
    mailStatus.value !== 'all' || (storeParams.status && storeParams.status !== 'all')
  )

  return Boolean(searchText.value.trim())
    || Boolean(storeParams.text?.trim())
    || hasLocalDate
    || hasStoreDate
    || hasStatusFilter
    || searchType.value !== defaultSearchType.value
})

function toLocalSearchDate(dateValue) {
  if (!dateValue) return ''
  const date = new Date(`${String(dateValue).replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatSearchDate(dateValue, endOfDay = false) {
  if (!dateValue) return ''
  const [year, month, day] = String(dateValue).split('-').map(Number)
  if (!year || !month || !day) return ''
  const localDate = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
  )
  return localDate.toISOString().slice(0, 19).replace('T', ' ')
}

function syncFromStore() {
  const params = props.searchStore?.searchParams || {}
  searchText.value = params.text || ''
  searchType.value = props.searchOptions.some(option => option.type === params.type)
    ? params.type
    : defaultSearchType.value

  if (props.showSearchStatus) {
    mailStatus.value = statusOptions.value.some(option => option.value === params.status)
      ? params.status
      : 'all'
  }

  const start = toLocalSearchDate(params.startDate)
  const end = toLocalSearchDate(params.endDate)
  if (start && end) {
    dateRange.value = [start, end]
  } else if (start || end) {
    const single = start || end
    dateRange.value = [single, single]
  } else {
    dateRange.value = null
  }
}

watch(
  () => props.searchOptions,
  options => {
    if (!options.some(option => option.type === searchType.value)) {
      searchType.value = options[0]?.type || 'subject'
    }
  },
  {immediate: true}
)

watch(
  () => props.searchStore?.searchParams,
  () => {
    syncFromStore()
  },
  {deep: true, immediate: true}
)

function buildStorePayload() {
  const [start, end] = Array.isArray(dateRange.value) ? dateRange.value : ['', '']
  const payload = {
    text: searchText.value.trim(),
    type: searchType.value,
    startDate: formatSearchDate(start, false),
    endDate: formatSearchDate(end, true),
  }
  if (props.showSearchStatus) {
    payload.status = mailStatus.value
  }
  return payload
}

function handleSearch() {
  const trimmed = searchText.value.trim()
  if (searchText.value !== trimmed) {
    searchText.value = trimmed
  }
  props.searchStore.setSearchParams(buildStorePayload())
}

function handleReset() {
  searchText.value = ''
  searchType.value = defaultSearchType.value
  dateRange.value = null
  if (props.showSearchStatus) {
    mailStatus.value = 'all'
  }
  const payload = {
    text: '',
    type: defaultSearchType.value,
    startDate: '',
    endDate: '',
  }
  if (props.showSearchStatus) {
    payload.status = 'all'
  }
  props.searchStore.setSearchParams(payload)
}

function selectSearchType(type) {
  const changed = searchType.value !== type
  searchType.value = type
  if (searchText.value.trim()) {
    if (changed) {
      handleSearch()
    }
  } else {
    nextTick(() => {
      inputRef.value?.focus?.()
    })
  }
}

function selectStatus(status) {
  if (mailStatus.value === status) return
  mailStatus.value = status
  handleSearch()
}
</script>

<style>
@media (max-width: 767px) {
  .inline-mail-date-popper.el-popper {
    max-width: calc(100vw - 20px);
  }

  .inline-mail-date-popper .el-date-range-picker {
    width: min(320px, calc(100vw - 24px));
  }

  .inline-mail-date-popper .el-date-range-picker .el-picker-panel__body {
    min-width: auto;
    display: flex;
    flex-direction: column;
  }

  .inline-mail-date-popper .el-date-range-picker__content {
    width: 100%;
    box-sizing: border-box;
  }

  .inline-mail-date-popper .el-date-range-picker__content.is-left {
    border-right: none;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
}
</style>

<style scoped lang="scss">
.inline-mail-search {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 15px 9px;
  background: var(--el-bg-color);
  box-shadow: var(--header-actions-border);
  box-sizing: border-box;
}

.search-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-width: 0;
}

.search-row-top {
  justify-content: space-between;
}

.search-row-top-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  min-width: 0;
}

.search-row-top-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}

.pill-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.pill-group-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  user-select: none;
}

.segmented-pills {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 32px;
  padding: 2px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  box-sizing: border-box;
}

.pill-item {
  height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 12.5px;
  font-weight: 400;
  line-height: 26px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;

  &:hover:not(.active) {
    color: var(--el-text-color-primary);
  }

  &.active {
    background: var(--el-bg-color);
    color: var(--el-color-primary);
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }
}

.search-row-bottom {
  gap: 8px;
}

.row2-left {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--el-border-color-lighter);
  flex-shrink: 0;
  margin: 0 2px;
}

.search-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  flex: 1 1 auto;
  gap: 8px;
  min-width: 0;
}

.input-prefix-icon {
  color: var(--el-text-color-placeholder);
}

.search-keyword-input {
  flex: 1 1 200px;
  min-width: 160px;
  max-width: 320px;

  :deep(.el-input__wrapper) {
    height: 34px;
    border-radius: 8px;
    box-sizing: border-box;
  }
}

:deep(.search-date-picker),
.search-date-picker {
  flex: 0 1 240px;
  width: 240px !important;
  max-width: 100%;
  height: 34px !important;
  border-radius: 8px !important;
  box-sizing: border-box;
  padding: 0 10px;
}

:deep(.search-date-picker .el-range-input) {
  font-size: 12.5px;
}

:deep(.search-date-picker .el-range-separator) {
  font-size: 12px;
  padding: 0 4px;
}

.search-btn-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.search-action-btn {
  height: 34px;
  border-radius: 8px;
  padding: 0 14px;
  font-size: 13px;
  margin-left: 0 !important;
}

@media (max-width: 767px) {
  .inline-mail-search {
    gap: 8px;
    padding: 10px 15px 9px;
  }

  .search-row-top {
    gap: 6px;
  }

  .search-row-top-left {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .search-row-top-right {
    width: 100%;
    justify-content: flex-end;
    margin-left: 0;
  }

  .pill-group {
    width: 100%;
  }

  .pill-group-label {
    display: none;
  }

  .segmented-pills {
    display: flex;
    width: 100%;
  }

  .pill-item {
    flex: 1 1 0;
    min-width: 0;
    padding: 0 4px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toolbar-divider {
    display: none;
  }

  .row2-left {
    width: 100%;
  }

  .search-controls {
    width: 100%;
  }

  .search-keyword-input {
    flex: 1 1 100%;
    max-width: 100%;
    width: 100%;
  }

  :deep(.search-date-picker),
  .search-date-picker {
    flex: 1 1 100%;
    width: 100% !important;
  }

  .search-btn-group {
    width: 100%;
  }

  .search-action-btn {
    flex: 1 1 0;
  }
}
</style>
