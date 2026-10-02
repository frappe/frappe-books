<template>
  <FrappeBottomSheet
    :open="isInstallSheetOpen"
    :title="t`Install Books`"
    @update:open="(open: boolean) => !open && close()"
  >
    <div
      class="flex flex-col items-center gap-4 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] text-center"
    >
      <img
        v-if="appIconUrl"
        :src="appIconUrl"
        alt=""
        class="size-16 rounded-6 ring-1 ring-outline-gray-1"
      />
      <p class="text-p-md text-ink-gray-7">
        {{
          t`Add Books to your home screen to open it full screen, like an app.`
        }}
      </p>
      <ol
        v-if="!installPrompt"
        class="w-full divide-y divide-outline-gray-1 rounded-6 bg-surface-gray-1 text-start"
      >
        <li
          v-for="(step, index) in iosSteps"
          :key="step.label"
          class="flex min-h-13 items-center gap-3 px-3.5 text-md text-ink-gray-8"
        >
          <span class="w-6 text-md-semibold text-ink-gray-5">{{ index + 1 }}</span>
          <span class="flex-1">{{ step.label }}</span>
          <span :class="step.icon" class="size-5" aria-hidden="true" />
        </li>
      </ol>
      <div class="flex w-full flex-col gap-2 pt-1">
        <FrappeButton
          v-if="installPrompt"
          size="lg"
          variant="solid"
          :label="t`Install`"
          @click="install"
        />
        <FrappeButton
          size="lg"
          :variant="installPrompt ? 'ghost' : 'subtle'"
          :label="installPrompt ? t`Not now` : t`Got it`"
          @click="close"
        />
      </div>
    </div>
  </FrappeBottomSheet>
</template>
<script setup lang="ts">
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
} from 'frappe-ui';
import { t } from 'fyo';
import {
  canInstall,
  getAppIconUrl,
  installPrompt,
  isInstallSheetOpen,
} from 'src/web/pwa';
import { onMounted, watch } from 'vue';

const appIconUrl = getAppIconUrl();
const SNOOZED_AT_KEY = 'booksInstallSheetSnoozedAt';
const SNOOZE_DAYS = 30;

const iosSteps = [
  {
    label: t`Tap Share in the Safari toolbar`,
    icon: 'lucide-share text-ink-blue-link',
  },
  {
    label: t`Choose Add to Home Screen`,
    icon: 'lucide-square-plus text-ink-gray-7',
  },
];

onMounted(offerOnFirstVisit);
watch(installPrompt, offerOnFirstVisit);

function offerOnFirstVisit() {
  if (canInstall.value && !isSnoozed()) {
    isInstallSheetOpen.value = true;
  }
}

async function install() {
  const prompt = installPrompt.value;
  if (!prompt) {
    return;
  }

  isInstallSheetOpen.value = false;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  // A prompt can be shown only once.
  installPrompt.value = null;
  if (outcome === 'dismissed') {
    snooze();
  }
}

function close() {
  isInstallSheetOpen.value = false;
  snooze();
}

function snooze() {
  try {
    localStorage.setItem(SNOOZED_AT_KEY, String(Date.now()));
  } catch {
    // Storage can be blocked; the sheet then returns on the next visit.
  }
}

function isSnoozed(): boolean {
  try {
    const snoozedAt = Number(localStorage.getItem(SNOOZED_AT_KEY));
    return Date.now() - snoozedAt < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}
</script>
