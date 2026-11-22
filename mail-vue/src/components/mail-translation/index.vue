<template>
  <div class="mail-translation-wrap">
    <!-- 163 MailMaster + Xi-Mail inline translation banner -->
    <div v-if="showBanner" class="mail-translation-bar" :class="{ 'is-translated': isTranslatedView }">
      <div class="bar-left">
        <span class="translate-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 8h10M10 5v3m-4 0c1 3.8 3.6 6.8 7 8.5M13 8c-.9 3.5-3.2 6.4-7 8.5" />
            <path d="M13.5 19l3.2-8.5L20 19m-5.5-2.5h4.5" />
          </svg>
        </span>

        <template v-if="loading">
          <Icon icon="line-md:loading-loop" width="15" height="15" class="bar-spin" />
          <span class="bar-text">{{ $t('mailTranslating', { lang: currentTargetLabel }) }}</span>
        </template>

        <template v-else-if="errorMsg">
          <span class="bar-error">{{ errorMsg }}</span>
        </template>

        <template v-else-if="isTranslatedView">
          <span class="bar-text">{{ $t('mailTranslatedTo') }}</span>
          <el-select
            v-model="target"
            size="small"
            class="lang-select"
            :disabled="loading"
            @change="onTargetChange"
          >
            <el-option v-for="item in languageOptions" :key="item.id" :label="item.label" :value="item.id" />
          </el-select>
        </template>

        <template v-else>
          <span class="bar-text">{{ $t('mailCanTranslateTo', { lang: currentTargetLabel }) }}</span>
          <el-select
            v-if="manualOpen"
            v-model="target"
            size="small"
            class="lang-select"
            :disabled="loading"
          >
            <el-option v-for="item in languageOptions" :key="item.id" :label="item.label" :value="item.id" />
          </el-select>
        </template>
      </div>

      <div class="bar-right">
        <button
          v-if="!loading && isTranslatedView"
          type="button"
          class="bar-action is-outline"
          @click="showOriginalContent"
        >
          {{ $t('mailShowOriginal') }}
        </button>

        <button
          v-else-if="!loading"
          type="button"
          class="bar-action"
          @click="runTranslate"
        >
          {{ errorMsg ? $t('mailRetryTranslate') : $t('mailTranslateNow') }}
        </button>
      </div>
    </div>

    <!-- Body slot: receives translation state so scroll container stays clean -->
    <slot
      :showing-translation="isTranslatedView"
      :translated-html="translatedHtml"
      :translated-text="translatedText"
      :translated-target="translatedTarget"
    />
  </div>
</template>

<script setup>
import {computed, onBeforeUnmount, ref, watch} from 'vue';
import {Icon} from '@iconify/vue';
import {useI18n} from 'vue-i18n';
import {translateEmail} from '@/request/translation.js';
import {useSettingStore} from '@/store/setting.js';

const CACHE_MAX = 30;
const sessionCache = new Map();

function getCached(key) {
  if (!sessionCache.has(key)) return null;
  const val = sessionCache.get(key);
  sessionCache.delete(key);
  sessionCache.set(key, val);
  return val;
}

function setCached(key, val) {
  if (sessionCache.has(key)) sessionCache.delete(key);
  sessionCache.set(key, val);
  if (sessionCache.size > CACHE_MAX) {
    const oldest = sessionCache.keys().next().value;
    sessionCache.delete(oldest);
  }
}

const props = defineProps({
  email: {
    type: Object,
    required: true
  },
  manualOpen: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:translatedSubject']);
const {t} = useI18n();
const settingStore = useSettingStore();

const languageOptions = [
  { id: 'zh',    label: '简体中文' },
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'en',    label: 'English' },
  { id: 'ja',    label: '日本語' },
  { id: 'ko',    label: '한국어' },
  { id: 'fr',    label: 'Français' },
  { id: 'de',    label: 'Deutsch' },
  { id: 'es',    label: 'Español' },
  { id: 'ru',    label: 'Русский' },
  { id: 'pt',    label: 'Português' },
];

const defaultTarget = computed(() => (settingStore.lang === 'en' ? 'en' : 'zh'));
const target = ref(defaultTarget.value);
const loading = ref(false);
const errorMsg = ref('');
const ready = ref(false);
const showOriginal = ref(false);
const translatedTarget = ref('');
const translatedSubject = ref('');
const translatedHtml = ref('');
const translatedText = ref('');

let disposed = false;
let reqSeq = 0;

const isTranslatedView = computed(() => (
  ready.value && !showOriginal.value && translatedTarget.value === target.value
));

const currentTargetLabel = computed(() => {
  return languageOptions.find(item => item.id === target.value)?.label || '简体中文';
});

function stripHtmlForDetect(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const shouldSuggestTranslate = computed(() => {
  const mail = props.email;
  if (!mail?.emailId) return false;
  const sample = `${mail.subject || ''} ${mail.text || stripHtmlForDetect(mail.content)}`.slice(0, 2000);
  if (!sample.trim()) return false;

  const cleaned = sample
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ');

  const zhCount = (cleaned.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinCount = (cleaned.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const otherForeignCount = (cleaned.match(/[\u0400-\u04ff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;

  if (defaultTarget.value === 'zh') {
    const foreign = latinCount + otherForeignCount;
    return foreign >= 14 && zhCount / (zhCount + foreign) < 0.25;
  }
  const nonLatin = zhCount + otherForeignCount;
  return nonLatin >= 8 && latinCount / (latinCount + nonLatin) < 0.35;
});

const showBanner = computed(() => {
  if (!props.email?.emailId) return false;
  if (props.manualOpen) return true;
  if (ready.value || loading.value || errorMsg.value) return true;
  return shouldSuggestTranslate.value;
});

function syncSubjectEmit() {
  if (isTranslatedView.value && translatedSubject.value) {
    emit('update:translatedSubject', translatedSubject.value);
  } else {
    emit('update:translatedSubject', '');
  }
}

function resetState() {
  reqSeq++;
  target.value = defaultTarget.value;
  loading.value = false;
  errorMsg.value = '';
  ready.value = false;
  showOriginal.value = false;
  translatedTarget.value = '';
  translatedSubject.value = '';
  translatedHtml.value = '';
  translatedText.value = '';
  emit('update:translatedSubject', '');
}

watch(() => props.email?.emailId, () => {
  resetState();
});

onBeforeUnmount(() => {
  disposed = true;
  reqSeq++;
  emit('update:translatedSubject', '');
});

async function runTranslate() {
  const emailId = props.email?.emailId;
  if (!emailId || loading.value) return;

  const lang = target.value;
  const cacheKey = `${emailId}:${lang}`;
  const cached = getCached(cacheKey);
  if (cached) {
    translatedSubject.value = cached.subject || '';
    translatedHtml.value = cached.html || '';
    translatedText.value = cached.text || '';
    translatedTarget.value = lang;
    ready.value = true;
    showOriginal.value = false;
    errorMsg.value = '';
    syncSubjectEmit();
    return;
  }

  loading.value = true;
  errorMsg.value = '';
  const currentSeq = ++reqSeq;
  try {
    const res = await translateEmail(emailId, lang);
    if (disposed || currentSeq !== reqSeq) return;
    setCached(cacheKey, res);
    translatedSubject.value = res.subject || '';
    translatedHtml.value = res.html || '';
    translatedText.value = res.text || '';
    translatedTarget.value = res.target || lang;
    ready.value = true;
    showOriginal.value = false;
    syncSubjectEmit();
  } catch (err) {
    if (!disposed && currentSeq === reqSeq) {
      errorMsg.value = err?.message || t('mailTranslationFailed');
    }
  } finally {
    if (!disposed && currentSeq === reqSeq) {
      loading.value = false;
    }
  }
}

function onTargetChange() {
  runTranslate();
}

function showOriginalContent() {
  showOriginal.value = true;
  syncSubjectEmit();
}
</script>

<style scoped lang="scss">
.mail-translation-wrap {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}

.mail-translation-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  margin-top: 12px;
  margin-bottom: 14px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
  font-size: 13px;
  color: var(--el-text-color-regular);
  transition: border-color 0.18s ease, background 0.18s ease;

  &.is-translated {
    border-color: var(--el-color-primary-light-7);
    background: var(--el-color-primary-light-9);
  }
}

.bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.translate-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.bar-spin {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.bar-text {
  color: var(--el-text-color-primary);
  line-height: 1.4;
}

.bar-error {
  color: var(--el-color-danger);
  line-height: 1.4;
}

.lang-select {
  width: 108px;
}

.bar-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.bar-action {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.3;
  color: #ffffff;
  background: var(--el-color-primary);
  border: 1px solid var(--el-color-primary);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;

  &:hover {
    background: var(--el-color-primary-dark-2);
    border-color: var(--el-color-primary-dark-2);
  }

  &.is-outline {
    color: var(--el-color-primary);
    background: var(--el-bg-color);
    border-color: var(--el-color-primary-light-5);

    &:hover {
      background: var(--el-color-primary);
      border-color: var(--el-color-primary);
      color: #ffffff;
    }
  }
}

@media (max-width: 600px) {
  .mail-translation-bar {
    padding: 8px 10px;
    gap: 8px;
  }
  .lang-select {
    width: 96px;
  }
}
</style>
