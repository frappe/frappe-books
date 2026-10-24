<template>
  <div :class="isMobile ? 'flex flex-col gap-4 p-4' : 'space-y-4'">
    <FrappeAlert
      v-if="!setupComplete"
      theme="amber"
      :title="t`Finish ERPNext setup first`"
      :description="
        t`Complete the ERPNext setup wizard, then come back here to turn on accessory mode.`
      "
    />

    <template v-if="isMobile">
      <FrappeSelect
        size="lg"
        :label="companyLabel"
        :description="companyDescription"
        :error="companyError || undefined"
        :options="companies"
        :placeholder="companyPlaceholder"
        :disabled="isCompanyLocked"
        :model-value="company || null"
        @update:model-value="setCompany"
      />
      <FrappeDivider />
      <FrappeSwitch
        size="md"
        :label="switchLabel"
        :description="switchDescription"
        :disabled="isSwitchDisabled"
        :model-value="isOn"
        @update:model-value="confirmSwitch"
      />
    </template>
    <div v-else class="divide-y divide-outline-gray-1">
      <FrappeSettingsRow
        :title="companyLabel"
        :description="companyDescription"
      >
        <div class="w-[220px] space-y-1">
          <FrappeSelect
            class="w-full"
            :options="companies"
            :placeholder="companyPlaceholder"
            :disabled="isCompanyLocked"
            :model-value="company || null"
            @update:model-value="setCompany"
          />
          <FrappeErrorMessage :message="companyError" />
        </div>
      </FrappeSettingsRow>
      <FrappeSettingsRow :title="switchLabel" :description="switchDescription">
        <FrappeSwitch
          size="sm"
          :disabled="isSwitchDisabled"
          :model-value="isOn"
          @update:model-value="confirmSwitch"
        />
      </FrappeSettingsRow>
    </div>

    <!-- The switch moves only after the reload the confirmed change brings. -->
    <FrappeDialog
      v-model:open="isConfirming"
      size="sm"
      :title="confirmTitle"
      :show-close-button="false"
      :actions="confirmActions"
    >
      <div class="space-y-4">
        <p class="text-p-base text-ink-gray-7">{{ confirmMessage }}</p>
        <FrappeAlert
          v-if="switchError"
          theme="red"
          :title="switchErrorTitle"
          :description="switchError"
        />
      </div>
    </FrappeDialog>
  </div>
</template>
<script setup lang="ts">
import {
  Alert as FrappeAlert,
  Dialog as FrappeDialog,
  Divider as FrappeDivider,
  ErrorMessage as FrappeErrorMessage,
  Select as FrappeSelect,
  SettingsRow as FrappeSettingsRow,
  Switch as FrappeSwitch,
  type DialogAction,
} from 'frappe-ui';
import { t } from 'fyo';
import type { ERPNextSettings } from 'models/baseModels/ERPNextSettings/ERPNextSettings';
import { getAllDocuments } from 'src/frappe/api';
import { isAccessoryMode } from 'src/frappe/mode';
import { fyo } from 'src/initFyo';
import router from 'src/router';
import { getErrorMessage } from 'src/utils';
import { isMobile } from 'src/utils/viewport';
import { computed, onMounted, ref } from 'vue';

/** Settings → ERPNext: the default company and the accessory mode switch, saved as they change. */
const doc = fyo.singles.ERPNextSettings as ERPNextSettings;
const setupComplete = !!window.frappe.boot?.books?.erpnext?.setup_complete;
// The boot's mode, which falls back to standalone when the company is gone.
const isOn = isAccessoryMode();

const companies = ref<string[]>([]);
const company = ref(doc.default_company ?? '');
const companyError = ref('');
const isConfirming = ref(false);
const switchError = ref('');

const companyLabel = t`Default company`;
const companyDescription = isOn
  ? t`Books works on one company at a time. Turn off accessory mode to change it.`
  : t`Books works on one company at a time. Required for accessory mode.`;
const companyPlaceholder = setupComplete
  ? t`Select company`
  : t`No companies yet`;
const isCompanyLocked = !setupComplete || isOn;

const switchLabel = t`Accessory mode`;
const switchDescription = t`Books becomes a simple UI for ERPNext. Standalone Books data stays as it is and comes back when you turn this off.`;
const isSwitchDisabled = computed(
  () => !setupComplete || (!isOn && !company.value)
);

const confirmTitle = isOn
  ? t`Turn off accessory mode?`
  : t`Turn on accessory mode?`;
const confirmMessage = computed(() =>
  isOn
    ? t`You'll see your Books data instead of ERPNext data. Books will reload.`
    : t`You'll see ERPNext data for ${company.value} instead of your Books data. Books will reload.`
);
const switchErrorTitle = isOn
  ? t`Couldn't turn off accessory mode`
  : t`Couldn't turn on accessory mode`;
const confirmActions: DialogAction[] = [
  {
    label: t`Cancel`,
    variant: 'subtle',
    onClick: ({ close }) => close(),
  },
  {
    label: isOn ? t`Turn off` : t`Turn on`,
    variant: 'solid',
    onClick: switchMode,
  },
];

onMounted(async () => {
  if (!setupComplete) {
    return;
  }

  const rows = await getAllDocuments('Company', {
    fields: ['name'],
    orderBy: 'name asc',
  });
  companies.value = rows.map(({ name }) => String(name));
});

async function setCompany(value?: string | number | null) {
  companyError.value = '';
  company.value = value ? String(value) : '';
  try {
    await doc.setAndSync('default_company', company.value || null);
  } catch (error) {
    companyError.value = getErrorMessage(error as Error);
    await doc.load();
    company.value = doc.default_company ?? '';
  }
}

function confirmSwitch() {
  switchError.value = '';
  isConfirming.value = true;
}

/** Saves the opposite mode and reloads to the dashboard in it; a refusal stays in the dialog. */
async function switchMode() {
  switchError.value = '';
  try {
    await doc.setAndSync('accessory_mode', !isOn);
  } catch (error) {
    switchError.value = getErrorMessage(error as Error);
    await doc.load();
    return;
  }

  window.location.assign(router.resolve('/').href);
}
</script>
