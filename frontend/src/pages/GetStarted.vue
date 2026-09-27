<template>
  <div class="flex flex-col overflow-y-hidden">
    <PageHeader :title="t`Set Up Your Workspace`" />
    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
      "
    >
      <div
        v-for="section in sections"
        :key="section.label"
        class="p-4 border-b border-outline-gray-1"
      >
        <h2 class="font-medium text-ink-gray-8">{{ section.label }}</h2>
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
                <component
                  :is="getIconComponent(item)"
                  v-show="activeCard !== item.key && !isCompleted(item)"
                  class="mb-4"
                />
                <Icon
                  v-show="isCompleted(item)"
                  name="green-check"
                  size="24"
                  class="w-5 h-5 mb-4"
                />
                <h3 class="font-medium">{{ item.label }}</h3>
                <p class="mt-2 text-sm text-ink-gray-8">
                  {{ item.description }}
                </p>
              </div>
              <div
                v-show="activeCard === item.key && !isCompleted(item)"
                class="flex gap-2 mt-2 overflow-hidden"
              >
                <Button
                  v-if="item.action"
                  class="leading-tight text-base"
                  type="primary"
                  @click="handleAction(item)"
                >
                  {{ t`Set Up` }}
                </Button>
                <Button
                  v-if="item.documentation"
                  class="leading-tight text-base"
                  @click="handleDocumentation(item)"
                >
                  {{ t`Documentation` }}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { DocValue } from 'fyo/core/types';
import Button from 'src/components/Button.vue';
import Icon from 'src/components/Icon.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { fyo } from 'src/initFyo';
import { getGetStartedConfig } from 'src/utils/getStartedConfig';
import { getTaskChecks } from 'src/utils/getStartedTasks';
import { GetStartedConfigItem } from 'src/utils/types';
import { Component, defineComponent, h } from 'vue';

type ListItem = GetStartedConfigItem['items'][number];

export default defineComponent({
  name: 'GetStarted',
  components: {
    PageHeader,
    Button,
    Icon,
  },
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data() {
    return {
      activeCard: null as string | null,
      sections: getGetStartedConfig(),
    };
  },
  async activated() {
    await fyo.doc.getDoc('GetStarted');
    if (fyo.can('GetStarted', 'write')) {
      await this.checkForCompletedTasks();
    }
  },
  methods: {
    async handleDocumentation({ key, documentation }: ListItem) {
      if (documentation) {
        window.open(documentation, '_blank', 'noopener,noreferrer');
      }

      switch (key) {
        case 'Opening Balances':
          await this.updateChecks({ openingBalanceChecked: true });
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
          await this.updateChecks({ printSetup: true });
          break;
        case 'General':
          await this.updateChecks({ companySetup: true });
          break;
        case 'System':
          await this.updateChecks({ systemSetup: true });
          break;
        case 'Review Accounts':
          await this.updateChecks({ chartOfAccountsReviewed: true });
          break;
        case 'Add Taxes':
          await this.updateChecks({ taxesAdded: true });
          break;
      }
    },
    async checkIsOnboardingComplete() {
      if (fyo.singles.GetStarted?.onboardingComplete) {
        return true;
      }

      const doc = await fyo.doc.getDoc('GetStarted');
      const onboardingComplete = fyo.schemaMap.GetStarted?.fields
        .filter(({ fieldname }) => fieldname !== 'onboardingComplete')
        .map(({ fieldname }) => doc.get(fieldname))
        .every(Boolean);

      if (onboardingComplete) {
        await this.updateChecks({ onboardingComplete });
        const systemSettings = await fyo.doc.getDoc('SystemSettings');
        await systemSettings.set('hideGetStarted', true);
        await systemSettings.sync();
      }

      return onboardingComplete;
    },
    async checkForCompletedTasks() {
      if (await this.checkIsOnboardingComplete()) {
        return;
      }

      await this.updateChecks(await getTaskChecks(fyo));
    },
    async updateChecks(toUpdate: Record<string, DocValue>) {
      if (!fyo.can('GetStarted', 'write')) {
        return;
      }

      await fyo.singles.GetStarted?.setAndSync(toUpdate);
      await fyo.doc.getDoc('GetStarted');
    },
    isCompleted(item: ListItem) {
      return fyo.singles.GetStarted?.get(item.fieldname) || false;
    },
    getIconComponent(item: ListItem) {
      let completed = fyo.singles.GetStarted?.[item.fieldname] || false;
      let name = completed ? 'green-check' : item.icon;
      let size = completed ? '24' : '18';
      return {
        name,
        render() {
          return h(Icon, {
            ...Object.assign(
              {
                name,
                size,
              },
              this.$attrs
            ),
          });
        },
      } as Component;
    },
  },
});
</script>
