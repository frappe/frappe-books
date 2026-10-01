<template>
  <div class="flex flex-col overflow-y-hidden">
    <PageHeader :title="t`Set Up Your Workspace`" />
    <FrappeScrollArea class="min-h-0 flex-1" viewport-class="pb-10">
      <div
        v-for="section in sections"
        :key="section.label"
        class="border-b border-outline-gray-1 px-3 py-4 sm:px-5"
      >
        <h2 class="text-lg-semibold text-ink-gray-8">{{ section.label }}</h2>
        <div class="flex mt-4 gap-4">
          <div
            v-for="item in section.items"
            :key="item.label"
            class="w-full md:w-1/3 sm:w-1/2"
          >
            <div
              class="
                flex flex-col
                justify-between
                h-40
                p-4
                border
                border-outline-gray-1 text-ink-gray-8
                rounded-6
              "
              @mouseenter="() => (activeCard = item.key)"
              @mouseleave="() => (activeCard = null)"
            >
              <div>
                <span
                  v-show="activeCard !== item.key && !isCompleted(item)"
                  class="mb-4 block size-5"
                  :class="item.icon"
                  aria-hidden="true"
                />
                <span
                  v-show="isCompleted(item)"
                  class="lucide-circle-check-big mb-4 block size-5 text-ink-green-5"
                  aria-hidden="true"
                />
                <h3 class="text-base-medium">{{ item.label }}</h3>
                <p class="mt-2 text-sm text-ink-gray-8">
                  {{ item.description }}
                </p>
              </div>
              <div
                v-show="activeCard === item.key && !isCompleted(item)"
                class="flex gap-2 mt-2 overflow-hidden"
              >
                <FrappeButton
                  v-if="item.action"
                  variant="solid"
                  @click="handleAction(item)"
                >
                  {{ t`Set Up` }}
                </FrappeButton>
                <FrappeButton
                  v-if="item.documentation"
                  @click="handleDocumentation(item)"
                >
                  {{ t`Documentation` }}
                </FrappeButton>
              </div>
            </div>
          </div>
        </div>
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
    return {
      activeCard: null as string | null,
      sections: getGetStartedConfig(),
    };
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
        this.activeCard = null;
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
