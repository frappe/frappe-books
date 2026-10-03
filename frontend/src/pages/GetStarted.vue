<template>
  <div class="flex flex-col overflow-y-hidden">
    <PageHeader :title="t`Set up your workspace`" />
    <FrappeScrollArea class="min-h-0 flex-1" viewport-class="pb-10">
      <div class="mx-auto max-w-4xl space-y-6 px-3 pt-5 sm:px-5">
        <section v-for="section in sections" :key="section.label">
          <h2 class="text-lg-semibold text-ink-gray-8">{{ section.label }}</h2>
          <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="item in section.items"
              :key="item.label"
              class="flex flex-col rounded-6 border border-outline-gray-1 p-4 text-ink-gray-8"
            >
              <span
                v-if="isCompleted(item)"
                class="lucide-circle-check-big size-5 text-ink-green-5"
                aria-hidden="true"
              />
              <span v-else class="size-5" :class="item.icon" aria-hidden="true" />
              <h3 class="mt-4 text-base-medium">{{ item.label }}</h3>
              <p class="mt-2 text-p-sm text-ink-gray-7">
                {{ item.description }}
              </p>
              <div v-if="!isCompleted(item)" class="mt-auto flex gap-2 pt-4">
                <FrappeButton
                  v-if="item.action"
                  variant="ghost"
                  :label="t`Set up`"
                  @click="handleAction(item)"
                />
                <FrappeButton
                  v-if="item.documentation"
                  variant="ghost"
                  :label="t`Documentation`"
                  @click="handleDocumentation(item)"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </FrappeScrollArea>
  </div>
</template>

<script lang="ts">
import {
  Button as FrappeButton,
  ScrollArea as FrappeScrollArea,
} from 'frappe-ui';
import { DocValue } from 'fyo/core/types';
import PageHeader from 'src/components/PageHeader.vue';
import { getFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import { getGetStartedConfig } from 'src/utils/getStartedConfig';
import { GetStartedConfigItem } from 'src/utils/types';
import { defineComponent } from 'vue';

type ListItem = GetStartedConfigItem['items'][number];

export default defineComponent({
  name: 'GetStarted',
  components: {
    PageHeader,
    FrappeButton,
    FrappeScrollArea,
  },
  data() {
    return { sections: getGetStartedConfig() };
  },
  async activated() {
    // The server checks the record tasks each time the page loads them.
    await getFrappeDoc('GetStarted', 'GetStarted', { refresh: true });
    if (fyo.can('GetStarted', 'write')) {
      await this.hideWhenComplete();
    }
  },
  methods: {
    async handleDocumentation({ key, documentation }: ListItem) {
      if (documentation) {
        window.open(documentation, '_blank', 'noopener,noreferrer');
      }

      switch (key) {
        case 'Opening Balances':
          await this.updateChecks({ opening_balance_checked: true });
          break;
      }
    },
    async handleAction({ key, action }: ListItem) {
      if (action) {
        action();
      }

      switch (key) {
        case 'Print':
          await this.updateChecks({ print_setup: true });
          break;
        case 'General':
          await this.updateChecks({ company_setup: true });
          break;
        case 'System':
          await this.updateChecks({ system_setup: true });
          break;
        case 'Review Accounts':
          await this.updateChecks({ chart_of_accounts_reviewed: true });
          break;
        case 'Add Taxes':
          await this.updateChecks({ taxes_added: true });
          break;
      }
    },
    /** Once the server finds every task done, Get Started hides itself, only the first time. */
    async hideWhenComplete() {
      const doc = fyo.singles.GetStarted!;
      if (doc.onboarding_complete || !doc.tasks_complete) {
        return;
      }

      await this.updateChecks({ onboarding_complete: true });
      await fyo.singles.SystemSettings!.setAndSync('hide_get_started', true);
    },
    async updateChecks(toUpdate: Record<string, DocValue>) {
      if (!fyo.can('GetStarted', 'write')) {
        return;
      }

      await fyo.singles.GetStarted?.setAndSync(toUpdate);
    },
    isCompleted(item: ListItem) {
      return fyo.singles.GetStarted?.get(item.fieldname) || false;
    },
  },
});
</script>
