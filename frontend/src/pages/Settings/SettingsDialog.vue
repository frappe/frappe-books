<template>
  <!-- Books lists its own shortcuts, so the built-in toggle stays off. -->
  <FrappeSettingsDialog
    v-model:tab="activeTab"
    :open="settingsDialog.open"
    :size="isQuickEditOpen ? '7xl' : '4xl'"
    :keyboard-shortcut="false"
    @update:open="onOpenChange"
  >
    <FrappeSettingsSidebar>
      <FrappeSettingsNavGroup :label="t`Settings`">
        <FrappeSettingsNavItem
          v-for="tab in tabs"
          :key="tab.value"
          :value="tab.value"
        >
          <template #prefix>
            <span
              :class="[tab.icon, 'size-4 shrink-0 text-ink-gray-6']"
              aria-hidden="true"
            />
          </template>
          {{ tab.label }}
        </FrappeSettingsNavItem>
        <FrappeSettingsNavItem v-if="erpnextTab" :value="erpnextTab.value">
          <template #prefix>
            <img
              v-if="erpnextTab.icon"
              :src="erpnextTab.icon"
              class="size-4 shrink-0"
              alt=""
            />
          </template>
          {{ erpnextTab.label }}
        </FrappeSettingsNavItem>
      </FrappeSettingsNavGroup>
    </FrappeSettingsSidebar>

    <FrappeSettingsContent>
      <FrappeSettingsPanel
        v-for="tab in tabs"
        :key="tab.value"
        :value="tab.value"
      >
        <!-- Gap on the fixed header, so scrolled rows clip below Save (frappe/frappe-ui#1254). -->
        <FrappeSettingsHeader :title="tab.label" class="pb-6">
          <template #actions>
            <FrappeButton
              variant="solid"
              :label="t`Save`"
              :disabled="!canSave"
              @click="sync"
            />
          </template>
        </FrappeSettingsHeader>
        <FrappeSettingsBody>
          <div v-if="doc" class="space-y-11">
            <section v-for="[name, fields] in sections" :key="name">
              <h2
                v-if="name !== t`Default`"
                class="mb-2 text-lg-semibold text-ink-gray-8"
              >
                {{ name }}
              </h2>
              <div class="divide-y divide-outline-gray-1">
                <SettingsField
                  v-for="field in fields"
                  :key="field.fieldname"
                  :field="field"
                  :doc="doc"
                  :error="errors[field.fieldname]"
                  @change="
                    (value: DocValue) => onValueChange(doc!, field, value)
                  "
                />
              </div>
            </section>
          </div>
          <div v-else class="divide-y divide-outline-gray-1" aria-busy="true">
            <div
              v-for="width in ['w-40', 'w-32', 'w-48', 'w-36']"
              :key="width"
              class="flex items-center gap-8 py-3.5"
            >
              <Skeleton class="h-4 rounded-4" :class="width" />
              <Skeleton class="ms-auto h-7 w-60 rounded-4" />
            </div>
          </div>
        </FrappeSettingsBody>
      </FrappeSettingsPanel>

      <!-- Company and mode save as they change; the POS screen with Save. -->
      <FrappeSettingsPanel v-if="erpnextTab" :value="erpnextTab.value">
        <FrappeSettingsHeader :title="erpnextTab.label" class="pb-6">
          <template v-if="posScreenGroups.length" #actions>
            <FrappeButton
              variant="solid"
              :label="t`Save`"
              :disabled="!canSave"
              @click="sync"
            />
          </template>
        </FrappeSettingsHeader>
        <FrappeSettingsBody>
          <div class="space-y-11">
            <ERPNextSettings />
            <section v-for="group in posScreenGroups" :key="group.title">
              <h2 class="mb-2 text-lg-semibold text-ink-gray-8">
                {{ group.title }}
              </h2>
              <div class="divide-y divide-outline-gray-1">
                <SettingsField
                  v-for="field in group.fields"
                  :key="field.fieldname"
                  :field="field"
                  :doc="group.doc"
                  :error="errors[field.fieldname]"
                  @change="
                    (value: DocValue) => onValueChange(group.doc, field, value)
                  "
                />
              </div>
            </section>
          </div>
        </FrappeSettingsBody>
      </FrappeSettingsPanel>

      <!-- Records created from a settings field -->
      <Transition name="quickedit">
        <QuickEditForm
          v-if="isQuickEditOpen"
          ref="quickEdit"
          v-bind="quickEditProps"
          :key="`${quickEditProps.schemaName}.${quickEditProps.name}`"
        />
      </Transition>
    </FrappeSettingsContent>
  </FrappeSettingsDialog>
</template>
<script lang="ts">
import {
  Button as FrappeButton,
  SettingsBody as FrappeSettingsBody,
  SettingsContent as FrappeSettingsContent,
  SettingsDialog as FrappeSettingsDialog,
  SettingsHeader as FrappeSettingsHeader,
  SettingsNavGroup as FrappeSettingsNavGroup,
  SettingsNavItem as FrappeSettingsNavItem,
  SettingsPanel as FrappeSettingsPanel,
  SettingsSidebar as FrappeSettingsSidebar,
} from 'frappe-ui';
import Skeleton from 'src/components/Skeleton.vue';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { Field } from 'schemas/types';
import QuickEditForm from 'src/pages/QuickEditForm.vue';
import { settingsDialog } from 'src/utils/refs';
import { computed, defineComponent } from 'vue';
import ERPNextSettings from './ERPNextSettings.vue';
import SettingsField from './SettingsField.vue';
import { getERPNextTab, useSettings } from './useSettings';

export default defineComponent({
  components: {
    ERPNextSettings,
    FrappeButton,
    FrappeSettingsBody,
    FrappeSettingsContent,
    FrappeSettingsDialog,
    FrappeSettingsHeader,
    FrappeSettingsNavGroup,
    FrappeSettingsNavItem,
    FrappeSettingsPanel,
    FrappeSettingsSidebar,
    Skeleton,
    QuickEditForm,
    SettingsField,
  },
  provide() {
    // The ERPNext tab's controls edit the POS screen preferences, whose table is of Defaults.
    const posScreen = () => this.fyo.singles.POSScreenDefaults ?? null;
    return { doc: computed(() => this.doc ?? posScreen()) };
  },
  setup() {
    return { ...useSettings(), settingsDialog, erpnextTab: getERPNextTab() };
  },
  computed: {
    /** A tab that is not shown, e.g. Inventory with inventory off, opens the first. */
    activeTab: {
      get(): string {
        const { tab } = settingsDialog;
        const tabs = [...this.tabs, this.erpnextTab];
        return tabs.some((shown) => shown?.value === tab)
          ? tab
          : this.tabs[0].value;
      },
      set(tab: string) {
        settingsDialog.tab = tab;
      },
    },
    doc(): FrappeDoc | null {
      return this.fyo.singles[this.activeTab] ?? null;
    },
    sections(): [string, Field[]][] {
      const sections = this.groupedFields.get(this.activeTab) ?? new Map();
      return [...sections.entries()].filter(([, fields]) => fields.length);
    },
    /** Opened by a settings field's Create, so it shows inside the dialog. */
    isQuickEditOpen(): boolean {
      return settingsDialog.open && !!this.$route.query.edit;
    },
    /** The route query, as the router gives the `edit` view. */
    quickEditProps() {
      return this.$route.query as { name: string; schemaName: string };
    },
  },
  watch: {
    // Immediate: a deep link opens the dialog before it mounts.
    'settingsDialog.open': {
      immediate: true,
      async handler(open: boolean) {
        if (open) {
          this.setSaveShortcut();
          return;
        }

        this.deleteSaveShortcut();
        await this.reset();
      },
    },
    '$route.path'() {
      settingsDialog.open = false;
    },
  },
  methods: {
    async onOpenChange(open: boolean) {
      // Escape and outside clicks close the quick edit first.
      if (!open && this.isQuickEditOpen) {
        await (
          this.$refs.quickEdit as InstanceType<typeof QuickEditForm>
        ).routeToPrevious();
        return;
      }

      settingsDialog.open = open;
    },
  },
});
</script>
