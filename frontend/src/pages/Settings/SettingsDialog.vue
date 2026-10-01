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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { Field } from 'schemas/types';
import QuickEditForm from 'src/pages/QuickEditForm.vue';
import { settingsDialog } from 'src/utils/refs';
import { computed, defineComponent } from 'vue';
import SettingsField from './SettingsField.vue';
import { useSettings } from './useSettings';

export default defineComponent({
  components: {
    FrappeButton,
    FrappeSettingsBody,
    FrappeSettingsContent,
    FrappeSettingsDialog,
    FrappeSettingsHeader,
    FrappeSettingsNavGroup,
    FrappeSettingsNavItem,
    FrappeSettingsPanel,
    FrappeSettingsSidebar,
    QuickEditForm,
    SettingsField,
  },
  provide() {
    return { doc: computed(() => this.doc) };
  },
  setup() {
    return { ...useSettings(), settingsDialog };
  },
  computed: {
    /** A tab that is not shown, e.g. Inventory with inventory off, opens the first. */
    activeTab: {
      get(): string {
        const { tab } = settingsDialog;
        return this.tabs.some(({ value }) => value === tab)
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
