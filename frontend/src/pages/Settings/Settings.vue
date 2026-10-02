<template>
  <div ref="mobileSettings" class="flex min-h-full flex-col">
    <PageHeader :title="t`Settings`">
      <template #mobile>
        <FrappeButton
          v-if="canSave"
          variant="solid"
          size="md"
          :label="t`Save`"
          @click="saveOnPhone"
        />
      </template>
    </PageHeader>
    <div
      v-if="tabOptions.length > 1"
      ref="mobileTabs"
      class="sticky top-0 z-10 flex shrink-0 items-center overflow-x-auto border-b border-outline-gray-1 bg-surface-base px-4 py-2"
    >
      <!-- md is the largest TabButtons size (frappe/frappe-ui#1221). -->
      <FrappeTabButtons v-model="activeTab" :options="tabOptions" size="md" />
    </div>
    <template v-if="doc">
      <section
        v-for="[name, fields] in mobileSections"
        :key="name"
        class="flex flex-col gap-4 border-b border-outline-gray-1 p-4"
      >
        <h2
          v-if="activeGroup.size > 1 && name !== t`Default`"
          class="text-lg-semibold text-ink-gray-8"
        >
          {{ name }}
        </h2>
        <CommonFormSection
          switches
          :fields="fields"
          :doc="doc"
          :errors="errors"
          @value-change="
            (field: Field, value: DocValue) => onValueChange(doc!, field, value)
          "
        />
      </section>
    </template>
    <div v-if="showInstallButton" class="p-4">
      <FrappeButton
        class="w-full"
        size="lg"
        icon-left="lucide-download"
        :label="t`Install Books`"
        @click="isInstallSheetOpen = true"
      />
    </div>
  </div>
</template>
<script lang="ts">
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { ValidationError } from 'fyo/utils/errors';
import {
  TabButtons as FrappeTabButtons,
  Button as FrappeButton,
  shellScrollContainer,
} from 'frappe-ui';
import { ModelNameEnum } from 'models/types';
import { Field } from 'schemas/types';
import PageHeader from 'src/components/PageHeader.vue';
import { revealActiveTab } from 'src/mobile/revealActiveTab';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { canInstall, isInstallSheetOpen } from 'src/web/pwa';
import { computed, defineComponent, nextTick } from 'vue';
import CommonFormSection from '../CommonForm/CommonFormSection.vue';
import { useSettings } from './useSettings';

/** Phones; desktop shows settings in SettingsDialog. */
export default defineComponent({
  components: {
    FrappeButton,
    CommonFormSection,
    FrappeTabButtons,
    PageHeader,
  },
  provide() {
    return { doc: computed(() => this.doc) };
  },
  setup() {
    return { ...useSettings(), isInstallSheetOpen };
  },
  data() {
    return { activeTab: ModelNameEnum.AccountingSettings as string };
  },
  computed: {
    doc(): FrappeDoc | null {
      return this.fyo.singles[this.activeTab] ?? null;
    },
    tabOptions(): { value: string; label: string }[] {
      return this.tabs.map(({ value, label }) => ({ value, label }));
    },
    activeGroup(): Map<string, Field[]> {
      const group = this.groupedFields.get(this.activeTab);
      if (!group) {
        throw new ValidationError(
          `Tab group ${this.activeTab} has no value set`
        );
      }

      return group;
    },
    showInstallButton(): boolean {
      return (
        this.activeTab === ModelNameEnum.SystemSettings && canInstall.value
      );
    },
    mobileSections(): [string, Field[]][] {
      return [...this.activeGroup.entries()].filter(
        ([, fields]) => fields.length
      );
    },
  },
  watch: {
    async activeTab() {
      shellScrollContainer.value?.scrollTo({ top: 0 });
      await nextTick();
      revealActiveTab(this.$refs.mobileTabs as HTMLElement | undefined);
    },
  },
  activated(): void {
    const tab = this.$route.query.tab;
    if (
      typeof tab === 'string' &&
      this.tabs.some(({ value }) => value === tab)
    ) {
      this.activeTab = tab;
    }

    docsPathRef.value = docsPathMap.Settings ?? '';
    this.setSaveShortcut();
  },
  async deactivated(): Promise<void> {
    docsPathRef.value = '';
    this.deleteSaveShortcut();
    await this.reset();
  },
  methods: {
    /** Scrolls to the first invalid field instead of saving. */
    async saveOnPhone(): Promise<void> {
      const field = (
        this.$refs.mobileSettings as HTMLElement | undefined
      )?.querySelector('[role="alert"]')?.parentElement;
      if (!field) {
        await this.sync();
        return;
      }

      // scrollIntoView would also scroll the shell's clipped ancestors.
      const container = shellScrollContainer.value;
      const offset =
        field.getBoundingClientRect().top -
        (container?.getBoundingClientRect().top ?? 0);
      container?.scrollBy({
        top: offset - container.clientHeight / 3,
        behavior: 'smooth',
      });
    },
  },
});
</script>
