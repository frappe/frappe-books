<template>
  <div class="flex h-full flex-col">
    <PageHeader :title="t`Chart of Accounts`">
      <template #left>
        <FrappeBadge v-if="company" theme="gray" variant="subtle">
          {{ company }}
        </FrappeBadge>
      </template>
      <template #mobile-prefix>
        <FrappePageHeaderBackButton
          class="rtl-rotate-180"
          :label="t`Back`"
          fallback-route="/"
        />
      </template>
    </PageHeader>

    <div v-if="error" class="px-4 pt-4 sm:px-5">
      <FrappeAlert theme="red" :title="error" />
    </div>
    <div v-else-if="loading" class="flex flex-1 items-center justify-center">
      <FrappeSpinner />
    </div>
    <div
      v-else-if="!accounts.length"
      class="flex flex-1 items-center justify-center"
    >
      <EmptyState :title="t`No accounts`" icon="lucide-folder-tree" />
    </div>

    <!-- Phones: 44px rows for touch; a tap expands or collapses a group. -->
    <ul
      v-else-if="isMobile"
      class="pb-6 pt-1"
      :aria-label="t`Chart of Accounts`"
    >
      <li v-for="{ account, depth } in visibleRows" :key="account.name">
        <button
          type="button"
          class="flex h-11 w-full items-center gap-1.5 pe-4 text-start active:bg-surface-gray-2"
          :style="{ paddingInlineStart: `${16 + depth * 16}px` }"
          :aria-expanded="
            account.children.length ? isExpanded(account) : undefined
          "
          @click="onClick(account)"
        >
          <span
            class="size-4 shrink-0 text-ink-gray-5 transition-transform rtl-rotate-180"
            :class="[
              account.children.length ? 'lucide-chevron-right' : '',
              isExpanded(account) ? 'rotate-90' : '',
            ]"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate text-base text-ink-gray-8">
            {{ account.name }}
          </span>
          <span
            v-if="canReadLedger"
            class="shrink-0 text-sm tabular-nums text-ink-gray-5"
          >
            {{ getBalanceString(account) }}
          </span>
        </button>
      </li>
    </ul>

    <FrappeScrollArea
      v-else
      class="min-h-0 flex-1"
      viewport-class="px-3 pt-4 pb-10 sm:px-5"
    >
      <!-- Tree hides its own focus ring, so the focused row draws one (frappe/frappe-ui#1258). -->
      <FrappeTree
        v-model:expanded="expanded"
        class="max-w-[760px] [&_[role=treeitem]:focus-visible>[data-slot=row]]:focus-ring"
        :nodes="accounts"
        node-key="name"
        :aria-label="t`Chart of Accounts`"
      >
        <template #item-label="{ node }">
          <button
            type="button"
            class="min-w-0 flex-1 self-stretch truncate rounded-3 bg-transparent text-start text-base leading-tighter text-ink-gray-8"
            :title="String(node.name)"
            @keydown.enter.stop
            @keydown.space.stop
            @click.stop="onClick(node as AccountNode)"
          >
            {{ node.name }}
          </button>
        </template>
        <template v-if="canReadLedger" #item-suffix="{ node }">
          <span
            class="min-w-24 text-end text-base tabular-nums text-ink-gray-7"
          >
            {{ getBalanceString(node as AccountNode) }}
          </span>
        </template>
      </FrappeTree>
    </FrappeScrollArea>
  </div>
</template>
<script setup lang="ts">
/** The ERPNext account tree of the accessory company, read only; an account opens in quick edit. */
import {
  Alert as FrappeAlert,
  Badge as FrappeBadge,
  PageHeaderBackButton as FrappePageHeaderBackButton,
  ScrollArea as FrappeScrollArea,
  Spinner as FrappeSpinner,
  Tree as FrappeTree,
} from 'frappe-ui';
import { t } from 'fyo';
import { ModelNameEnum } from 'models/types';
import EmptyState from 'src/components/EmptyState.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { getDocType } from 'src/frappe/doctypes';
import { getFrappeDoc } from 'src/frappe/documents';
import { getAccessoryCompany } from 'src/frappe/mode';
import { fyo } from 'src/initFyo';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { openQuickEdit } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { serverHtmlToText } from 'src/utils/serverHtml';
import { call } from 'src/web/api';
import { computed, onActivated, onDeactivated, ref } from 'vue';

interface AccountNode {
  [key: string]: unknown;
  name: string;
  parent_account: string | null;
  root_type: string;
  is_group: number;
  children: AccountNode[];
}

const ROOT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

const company = getAccessoryCompany();
const canReadLedger = fyo.can(ModelNameEnum.GLEntry, 'read');
const accounts = ref<AccountNode[]>([]);
const expanded = ref<string[]>([]);
const balances = ref<Record<string, number>>({});
const creditRootTypes = ref<string[]>([]);
const loading = ref(true);
const error = ref('');

/** Accounts a phone lists: each open group's children under it, indented by depth. */
const visibleRows = computed(() => {
  const rows: { account: AccountNode; depth: number }[] = [];
  const add = (nodes: AccountNode[], depth: number) => {
    for (const account of nodes) {
      rows.push({ account, depth });
      if (isExpanded(account)) {
        add(account.children, depth + 1);
      }
    }
  };
  add(accounts.value, 0);
  return rows;
});

onActivated(async () => {
  docsPathRef.value = docsPathMap.ChartOfAccounts!;
  try {
    await load();
  } catch (err) {
    error.value = serverHtmlToText(
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    loading.value = false;
  }
});
onDeactivated(() => (docsPathRef.value = ''));

async function load() {
  const [nodes] = await Promise.all([
    getAccounts(),
    canReadLedger ? setBalances() : undefined,
  ]);
  const isFirstLoad = !accounts.value.length;
  accounts.value = toTree(nodes);
  if (isFirstLoad) {
    expanded.value = getFirstBranch(accounts.value);
  }
}

async function getAccounts(): Promise<AccountNode[]> {
  return await call<AccountNode[]>('frappe.client.get_list', {
    doctype: getDocType(ModelNameEnum.Account).doctype,
    fields: ['name', 'parent_account', 'root_type', 'is_group'],
    filters: [['company', '=', company]],
    order_by: 'lft asc',
    limit_page_length: 0,
  });
}

/** Balances are signed on the server by the side each root type keeps. */
async function setBalances() {
  const response = await call<{
    balances: Record<string, number>;
    credit_root_types: string[];
  }>('frappe_books.reports.financial_statements.get_account_balances');
  balances.value = response.balances;
  creditRootTypes.value = response.credit_root_types;
}

function toTree(nodes: AccountNode[]): AccountNode[] {
  const byName = new Map(
    nodes.map((node) => [node.name, { ...node, children: [] as AccountNode[] }])
  );
  const roots: AccountNode[] = [];
  for (const node of byName.values()) {
    const parent = byName.get(node.parent_account ?? '');
    (parent?.children ?? roots).push(node);
  }

  // ERPNext's order of the root types, as its balance sheet and the design list them.
  const rank = (root: AccountNode) => ROOT_TYPES.indexOf(root.root_type);
  return roots.sort((a, b) => rank(a) - rank(b));
}

/** The first root and its first group open, as the design opens them. */
function getFirstBranch(roots: AccountNode[]): string[] {
  const root = roots[0];
  const group = root?.children.find((child) => child.children.length);
  return [root?.name, group?.name].filter((name): name is string => !!name);
}

function isExpanded(account: AccountNode): boolean {
  return expanded.value.includes(account.name);
}

async function onClick(account: AccountNode) {
  if (account.children.length) {
    expanded.value = isExpanded(account)
      ? expanded.value.filter((name) => name !== account.name)
      : [...expanded.value, account.name];
    return;
  }

  const doc = await getFrappeDoc(ModelNameEnum.Account, account.name);
  await openQuickEdit({ doc });
}

/** A group's balance totals its accounts'. */
function getBalance(account: AccountNode): number {
  return account.children.reduce(
    (total, child) => total + getBalance(child),
    balances.value[account.name] ?? 0
  );
}

function getBalanceString(account: AccountNode): string {
  const side = creditRootTypes.value.includes(account.root_type)
    ? t`Cr.`
    : t`Dr.`;
  return `${fyo.format(getBalance(account), 'Currency')} ${side}`;
}
</script>
