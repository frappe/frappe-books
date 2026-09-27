<template>
  <div v-if="isMobile" ref="mobileSettings" class="flex min-h-full flex-col">
    <PageHeader :title="t`Settings`">
      <template #mobile>
        <FrappeButton
          v-if="canSave"
          variant="solid"
          :label="t`Save`"
          @click="saveOnPhone"
        />
      </template>
    </PageHeader>
    <div
      v-if="tabOptions.length > 1"
      ref="mobileTabs"
      class="sticky top-0 z-10 flex-shrink-0 overflow-x-auto bg-surface-base px-4 pt-3 shadow-[inset_0_-1px_0_var(--outline-gray-1)]"
    >
      <FrappeTabButtons
        v-model="activeTab"
        :options="tabOptions"
        variant="underline"
        size="md"
      />
    </div>
    <template v-if="doc">
      <section
        v-for="[name, fields] in mobileSections"
        :key="name"
        class="flex flex-col gap-4 border-b border-outline-gray-1 p-4"
      >
        <h2
          v-if="activeGroup.size > 1 && name !== t`Default`"
          class="text-base-semibold text-ink-gray-9"
        >
          {{ name }}
        </h2>
        <CommonFormSection
          :fields="fields"
          :doc="doc"
          :errors="errors"
          @value-change="onValueChange"
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
  <FormContainer v-else>
    <template #header>
      <FrappeButton v-if="canSave" variant="solid" @click="sync">
        {{ t`Save` }}
      </FrappeButton>
    </template>
    <template #body>
      <FormHeader
        :form-title="tabLabels[activeTab] ?? ''"
        :form-sub-title="t`Settings`"
        class="sticky top-0 bg-surface-base border-b border-outline-gray-1"
      >
      </FormHeader>

      <!-- Section Container -->
      <div v-if="doc" class="overflow-auto custom-scroll custom-scroll-thumb1">
        <CommonFormSection
          v-for="([name, fields], idx) in activeGroup.entries()"
          :key="name + idx"
          ref="section"
          class="p-4"
          :class="idx !== 0 && activeGroup.size > 1 ? 'border-t border-outline-gray-1' : ''"
          :show-title="activeGroup.size > 1 && name !== t`Default`"
          :title="name"
          :fields="fields"
          :doc="doc"
          :errors="errors"
          @value-change="onValueChange"
        />
      </div>

      <!-- Tab Bar -->
      <div
        v-if="groupedFields && groupedFields.size > 1"
        class="sticky bottom-0 mt-auto flex-shrink-0 border-t bg-surface-base p-4 border-outline-gray-1"
      >
        <FrappeTabButtons v-model="activeTab" :options="tabOptions" variant="underline" />
      </div>
    </template>
  </FormContainer>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { ValidationError } from 'fyo/utils/errors';
import {
  TabButtons as FrappeTabButtons,
  Button as FrappeButton,
  shellScrollContainer,
} from 'frappe-ui';
import { ModelNameEnum } from 'models/types';
import { Field, Schema } from 'schemas/types';
import FormContainer from 'src/components/FormContainer.vue';
import FormHeader from 'src/components/FormHeader.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getErrorMessage } from 'src/utils';
import { evaluateHidden } from 'src/utils/doc';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { showDialog } from 'src/utils/interactive';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { UIGroupedFields } from 'src/utils/types';
import { isMobile } from 'src/utils/viewport';
import { canInstall, isInstallSheetOpen } from 'src/web/pwa';
import { computed, defineComponent, inject, nextTick } from 'vue';
import CommonFormSection from '../CommonForm/CommonFormSection.vue';

const COMPONENT_NAME = 'Settings';

export default defineComponent({
  components: {
    FormContainer,
    FrappeButton,
    FormHeader,
    CommonFormSection,
    FrappeTabButtons,
    PageHeader,
  },
  provide() {
    return { doc: computed(() => this.doc) };
  },
  setup() {
    return {
      shortcuts: inject(shortcutsKey),
      isMobile,
      isInstallSheetOpen,
    };
  },
  data() {
    return {
      errors: {},
      activeTab: ModelNameEnum.AccountingSettings,
      groupedFields: null,
    } as {
      errors: Record<string, string>;
      activeTab: string;
      groupedFields: null | UIGroupedFields;
    };
  },
  computed: {
    canSave() {
      return [
        ModelNameEnum.AccountingSettings,
        ModelNameEnum.InventorySettings,
        ModelNameEnum.Defaults,
        ModelNameEnum.POSSettings,
        ModelNameEnum.PrintSettings,
        ModelNameEnum.SystemSettings,
      ].some((s) => this.fyo.singles[s]?.canSave);
    },
    doc(): Doc | null {
      const doc = this.fyo.singles[this.activeTab];
      if (!doc) {
        return null;
      }

      return doc;
    },
    tabLabels(): Record<string, string> {
      return {
        [ModelNameEnum.AccountingSettings]: this.t`General`,
        [ModelNameEnum.PrintSettings]: this.t`Print`,
        [ModelNameEnum.InventorySettings]: this.t`Inventory`,
        [ModelNameEnum.Defaults]: this.t`Defaults`,
        [ModelNameEnum.POSSettings]: this.t`POS Settings`,
        [ModelNameEnum.SystemSettings]: this.t`System`,
      };
    },
    tabOptions(): { value: string; label: string }[] {
      return [...(this.groupedFields?.keys() ?? [])].map((value) => ({
        value,
        label: this.tabLabels[value] ?? value,
      }));
    },
    schemas(): Schema[] {
      const enableInventory = !!this.fyo.singles.AccountingSettings?.enableInventory;
      const enablePOS = !!this.fyo.singles.InventorySettings?.enablePointOfSale;
      return [
        ModelNameEnum.AccountingSettings,
        ModelNameEnum.InventorySettings,
        ModelNameEnum.Defaults,
        ModelNameEnum.POSSettings,
        ModelNameEnum.PrintSettings,
        ModelNameEnum.SystemSettings,
      ]
        .filter((s) => {
          if (s === ModelNameEnum.InventorySettings && !enableInventory) {
            return false;
          }

          if (s === ModelNameEnum.POSSettings && !enablePOS) {
            return false;
          }

          return true;
        })
        .map((s) => this.fyo.schemaMap[s]!);
    },
    activeGroup(): Map<string, Field[]> {
      if (!this.groupedFields) {
        return new Map();
      }

      const group = this.groupedFields.get(this.activeTab);
      if (!group) {
        throw new ValidationError(`Tab group ${this.activeTab} has no value set`);
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
      if (!this.isMobile) {
        return;
      }

      shellScrollContainer.value?.scrollTo({ top: 0 });
      await nextTick();
      (this.$refs.mobileTabs as HTMLElement | undefined)
        ?.querySelector('[data-state="active"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
  },
  mounted() {
    this.update();
  },
  activated(): void {
    const tab = this.$route.query.tab;
    if (typeof tab === 'string' && this.tabLabels[tab]) {
      this.activeTab = tab;
    }

    docsPathRef.value = docsPathMap.Settings ?? '';
    this.shortcuts?.pmod.set(COMPONENT_NAME, ['KeyS'], async () => {
      if (!this.canSave) {
        return;
      }

      await this.sync();
    });
  },
  async deactivated(): Promise<void> {
    docsPathRef.value = '';
    this.shortcuts?.delete(COMPONENT_NAME);
    if (!this.canSave) {
      return;
    }
    await this.reset();
  },
  methods: {
    async reset() {
      const resetableDocs = this.schemas
        .map(({ name }) => this.fyo.singles[name])
        .filter((doc) => doc?.dirty) as Doc[];

      for (const doc of resetableDocs) {
        await doc.load();
      }

      this.update();
    },
    async sync(): Promise<void> {
      const syncableDocs = this.schemas
        .map(({ name }) => this.fyo.singles[name])
        .filter((doc) => doc?.canSave) as Doc[];

      for (const doc of syncableDocs) {
        if (!(await this.syncDoc(doc))) {
          return;
        }
      }

      await showDialog({
        title: this.t`Reload Frappe Books?`,
        detail: this.t`Changes made to settings will be visible on reload.`,
        type: 'info',
        buttons: [
          {
            label: this.t`Yes`,
            isPrimary: true,
            action: () => window.location.reload(),
          },
          {
            label: this.t`No`,
            action: () => null,
            isEscape: true,
          },
        ],
      });
    },
    /** Phones scroll to the first invalid field instead of saving. */
    async saveOnPhone(): Promise<void> {
      const field = (this.$refs.mobileSettings as HTMLElement | undefined)
        ?.querySelector('[role="alert"]')?.parentElement;
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
    async syncDoc(doc: Doc): Promise<boolean> {
      try {
        await doc.sync();
      } catch (error) {
        await handleErrorWithDialog(error, doc, true);
        return false;
      }

      try {
        this.updateGroupedFields();
      } catch (error) {
        this.fyo.reportDocumentActionWarning(doc, 'save', [error]);
      }
      return true;
    },
    async onValueChange(field: Field, value: DocValue): Promise<void> {
      const { fieldname } = field;
      delete this.errors[fieldname];

      try {
        await this.doc?.set(fieldname, value ?? '');
      } catch (err) {
        if (!(err instanceof Error)) {
          return;
        }

        this.errors[fieldname] = getErrorMessage(err, this.doc ?? undefined);
      }

      this.update();
    },
    update(): void {
      this.updateGroupedFields();
    },
    updateGroupedFields(): void {
      const grouped: UIGroupedFields = new Map();
      const fields: Field[] = this.schemas.map((s) => s.fields).flat();

      for (const field of fields) {
        const schemaName = field.schemaName!;
        if (!grouped.has(schemaName)) {
          grouped.set(schemaName, new Map());
        }

        const tabbed = grouped.get(schemaName)!;
        const section = field.section ?? this.t`Miscellaneous`;
        if (!tabbed.has(section)) {
          tabbed.set(section, []);
        }

        if (field.meta) {
          continue;
        }

        const doc = this.fyo.singles[schemaName];
        if (evaluateHidden(field, doc)) {
          continue;
        }

        tabbed.get(section)!.push(field);
      }

      this.groupedFields = grouped;
    },
  },
});
</script>
