<template>
  <div :class="cardClass">
    <FrappeChartContainer
      :title="t`Account balances`"
      :subtitle="subtitle"
      :loading="!isLoaded"
      :error="error"
      :empty="!accounts.length"
    >
      <!-- The header sits outside the state templates, so the button shows in every state. -->
      <template v-if="canChooseAccounts" #actions>
        <FrappeButton
          variant="ghost"
          :size="isMobile ? 'md' : 'sm'"
          icon="lucide-settings-2"
          :label="t`Choose accounts`"
          :tooltip="t`Choose accounts`"
          :route="settingsRoute"
        />
      </template>
      <!-- Rows stand in for the table, so the card keeps its shape while loading. -->
      <template #loading>
        <div class="space-y-3 pt-7">
          <div
            v-for="row in 3"
            :key="row"
            class="h-4 animate-pulse rounded bg-surface-gray-2"
          />
        </div>
      </template>
      <template #empty>
        <span class="text-p-sm text-ink-gray-5">
          {{ t`No cash or bank accounts` }}
        </span>
      </template>
      <template #error>
        <ChartLoadError @retry="loadData" />
      </template>

      <!-- Body rows scroll under the header and the Total, which stay put. -->
      <div class="h-full overflow-y-auto">
        <table class="w-full border-separate border-spacing-0 text-p-sm">
          <thead>
            <tr class="text-ink-gray-5">
              <th
                class="sticky top-0 bg-surface-base pb-1.5 pe-3 text-start font-normal"
              >
                {{ t`Account` }}
              </th>
              <th
                class="sticky top-0 bg-surface-base pb-1.5 text-end font-normal"
              >
                {{ t`Balance` }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in accounts" :key="row.account">
              <td
                class="w-full max-w-0 border-t border-outline-gray-1 py-1.5 pe-3"
              >
                <router-link
                  class="block truncate rounded-sm text-ink-gray-8 hover:underline focus-visible:focus-ring"
                  :to="getLedgerRoute(row.account)"
                >
                  {{ row.account_name }}
                </router-link>
              </td>
              <td
                class="whitespace-nowrap border-t border-outline-gray-1 py-1.5 text-end tabular-nums"
                :class="amountClass(row.balance)"
              >
                {{ fyo.format(row.balance, 'Currency') }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th
                class="sticky bottom-0 border-t border-outline-gray-2 bg-surface-base pe-3 pt-1.5 text-start font-medium text-ink-gray-8"
              >
                {{ t`Total` }}
              </th>
              <td
                class="sticky bottom-0 whitespace-nowrap border-t border-outline-gray-2 bg-surface-base pt-1.5 text-end font-medium tabular-nums"
                :class="amountClass(total)"
              >
                {{ fyo.format(total, 'Currency') }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </FrappeChartContainer>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import { Button as FrappeButton } from 'frappe-ui';
import { ChartContainer as FrappeChartContainer } from 'frappe-ui/charts';
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import { getCashBalances, type AccountBalance } from 'src/utils/dashboard';
import { defineComponent } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import DashboardChartBase from './BaseDashboardChart.vue';
import ChartLoadError from './ChartLoadError.vue';

/** Balances are as of the server's today, so the card leaves the inherited `period` alone. */
export default defineComponent({
  name: 'AccountBalances',
  components: {
    ChartLoadError,
    FrappeButton,
    FrappeChartContainer,
  },
  extends: DashboardChartBase,
  data: () => ({
    accounts: [] as AccountBalance[],
    total: 0,
    asOf: '',
    loadId: 0,
  }),
  computed: {
    /** Names the date the server used, so a card left open past midnight does not claim today. */
    subtitle(): string {
      return this.asOf
        ? t`As of ${fyo.format(this.asOf, 'Date')}`
        : t`As of today`;
    },
    /** Only users who may save Accounting Settings can change the list. */
    canChooseAccounts(): boolean {
      return fyo.can(ModelNameEnum.AccountingSettings, 'write');
    },
    /** The router opens Settings as a dialog on desktop and as a page on a phone. */
    settingsRoute(): RouteLocationRaw {
      return {
        path: '/settings',
        query: { tab: ModelNameEnum.AccountingSettings },
      };
    },
  },
  methods: {
    /** A reload or retry can overlap an older one; only the latest may write. */
    async loadData() {
      const loadId = ++this.loadId;
      this.error = null;
      try {
        const balances = await getCashBalances();
        if (loadId !== this.loadId) {
          return;
        }

        this.accounts = balances.accounts;
        this.total = balances.total;
        this.asOf = balances.as_of;
        this.isLoaded = true;
      } catch (error) {
        if (loadId !== this.loadId) {
          return;
        }

        this.error = String(error);
        console.error(error);
      }
    },
    amountClass(value: number): string {
      if (value > 0) {
        return 'text-ink-green-5';
      }

      return value < 0 ? 'text-ink-red-6' : 'text-ink-gray-8';
    },
    /** The ledger from the first entry to `as_of` closes on the row's balance. */
    getLedgerRoute(account: string): RouteLocationRaw {
      return {
        path: '/report/GeneralLedger',
        query: { account, toDate: this.asOf },
      };
    },
  },
});
</script>
