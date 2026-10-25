<template>
  <div class="flex flex-col h-full">
    <PageHeader :title="t`Chart of Accounts`">
      <template v-if="company" #left>
        <FrappeBadge theme="gray" variant="subtle">{{ company }}</FrappeBadge>
      </template>
      <template #mobile-prefix>
        <FrappePageHeaderBackButton
          class="rtl-rotate-180"
          :label="t`Back`"
          fallback-route="/"
        />
      </template>
      <FrappeButton v-if="canEditTree" @click="addRootGroup">{{
        t`Add root group`
      }}</FrappeButton>
      <FrappeButton v-if="!isAllExpanded" @click="expand">{{ t`Expand` }}</FrappeButton>
      <FrappeButton v-if="!isAllCollapsed" @click="collapse">{{
        t`Collapse`
      }}</FrappeButton>
    </PageHeader>
    <div v-if="error" class="px-4 pt-4 sm:px-5">
      <FrappeAlert theme="red" :title="error" />
    </div>
    <EmptyState
      v-else-if="root && !accounts.length"
      class="flex-1"
      :title="t`No accounts`"
      icon="lucide-folder-tree"
    />
    <!-- Phones (accessory mode only): 44px rows for touch; a tap expands or collapses a group. -->
    <ul
      v-else-if="root && isMobile"
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
            {{ accountLabel(account.name) }}
          </span>
          <span
            v-if="showsBalance(account)"
            class="shrink-0 text-sm tabular-nums text-ink-gray-5"
          >
            {{ getBalanceString(account) }}
          </span>
        </button>
      </li>
    </ul>
    <FrappeScrollArea
      v-else-if="root"
      class="min-h-0 flex-1"
      viewport-class="px-3 pt-4 pb-10 sm:px-5"
    >
      <!-- Tree hides its own focus ring, so the focused row draws one (frappe/frappe-ui#1258). -->
      <FrappeTree
        ref="tree"
        class="[&_[role=treeitem]:focus-visible>[data-slot=row]]:focus-ring"
        v-model:expanded="expandedAccounts"
        :nodes="accounts"
        node-key="name"
        :aria-label="t`Chart of Accounts`"
      >
        <template #item-prefix="{ node }">
          <span
            class="size-4 shrink-0"
            :class="getAccountIconName(node as AccountItem)"
            aria-hidden="true"
          />
        </template>
        <template #item-label="{ node }">
          <button
            type="button"
            class="min-w-0 flex-1 self-stretch truncate rounded-3 bg-transparent text-start text-base leading-tighter text-ink-gray-8"
            :title="accountLabel(String(node.name))"
            @keydown.enter.stop
            @keydown.space.stop
            @click.stop="onClick(node as AccountItem)"
          >
            {{ accountLabel(String(node.name)) }}
          </button>
        </template>
        <template #item-suffix="{ node }">
          <div class="flex shrink-0 items-center gap-3">
            <div
              v-if="getAccountActions(node as AccountItem).length"
              @click.stop
              @keydown.stop
            >
              <FrappeDropdown
                :options="getAccountActions(node as AccountItem)"
                align="end"
              >
                <template #trigger="{ open }">
                  <FrappeButton
                    variant="ghost"
                    size="xs"
                    icon="lucide-ellipsis"
                    :label="t`Actions for ${String(node.name)}`"
                    :tooltip="t`Actions for ${String(node.name)}`"
                    :class="
                      open
                        ? 'opacity-100'
                        : 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100'
                    "
                  />
                </template>
              </FrappeDropdown>
            </div>
            <span
              v-if="showsBalance(node as AccountItem)"
              class="min-w-24 text-end text-base tabular-nums text-ink-gray-7"
              >{{ getBalanceString(node as AccountItem) }}</span
            >
          </div>
        </template>
      </FrappeTree>
    </FrappeScrollArea>
    <div v-else-if="!error" class="px-3 pt-4 sm:px-5" aria-busy="true">
      <div
        v-for="width in ['w-56', 'w-40', 'w-48', 'w-36', 'w-44']"
        :key="width"
        class="flex h-8 items-center gap-2 px-1.5"
      >
        <Skeleton class="size-4 rounded-full" />
        <Skeleton class="h-4 rounded-4" :class="width" />
      </div>
    </div>
    <!-- Not dialog.prompt: it neither focuses the field nor submits on Enter (frappe/frappe-ui#1264). -->
    <FrappeDialog
      :open="!!addingParent"
      :title="newAccountTitle"
      :actions="newAccountActions"
      @close="cancelAddingAccount(addingParent)"
    >
      <p class="mb-4 text-p-base text-ink-gray-7">
        {{ t`Under ${addingParent?.name ?? ''}` }}
      </p>
      <FrappeTextInput
        ref="newAccount"
        v-model="newAccountName"
        :label="t`Account name`"
        required
        variant="outline"
        :disabled="insertingAccount"
        @keydown.enter="
          addingParent &&
          createNewAccount(addingParent, addingParent.addingGroupAccount)
        "
      />
    </FrappeDialog>
  </div>
</template>
<script lang="ts">
import { t } from 'fyo';
import {
  Alert as FrappeAlert,
  Badge as FrappeBadge,
  Dialog as FrappeDialog,
  Dropdown as FrappeDropdown,
  ScrollArea as FrappeScrollArea,
  TextInput as FrappeTextInput,
  Tree as FrappeTree,
  type DialogAction,
  type DropdownOptions,
  type TreeExposed,
  Button as FrappeButton,
  PageHeaderBackButton as FrappePageHeaderBackButton,
} from 'frappe-ui';
import Skeleton from 'src/components/Skeleton.vue';
import { ModelNameEnum } from 'models/types';
import EmptyState from 'src/components/EmptyState.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { getDocType } from 'src/frappe/doctypes';
import { getLinkLabel } from 'src/frappe/link';
import { getAccessoryCompany, isAccessoryMode } from 'src/frappe/mode';
import { getModel } from 'src/frappe/registry';
import { getFrappeDoc, newFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { commonDocDelete, openQuickEdit } from 'src/utils/ui';
import { call } from 'src/web/api';
import { defineComponent, nextTick } from 'vue';
import { handleErrorWithDialog } from '../errorHandling';
import { AccountRootType, AccountType } from 'models/baseModels/Account/types';
import { TreeViewSettings } from 'fyo/model/types';
import type { FrappeDoc } from 'src/frappe/document';
import { showDialog } from 'src/utils/interactive';
import { serverHtmlToText } from 'src/utils/serverHtml';
import { isMobile } from 'src/utils/viewport';

type AccountItem = {
  [key: string]: unknown;
  label: string;
  name: string;
  parent_account: string;
  root_type: AccountRootType;
  account_type: AccountType;
  is_group?: number;
  children: AccountItem[];
  addingAccount: boolean;
  addingGroupAccount: boolean;
};

type AccKey = 'addingAccount' | 'addingGroupAccount';

const ACCOUNT_FIELDS = [
  'name',
  'parent_account',
  'is_group',
  'root_type',
  'account_type',
];

// A root account's icon, by its root type, as both charts name their roots differently.
const rootAccountIcons: Record<string, string> = {
  Asset: 'lucide-landmark',
  Expense: 'lucide-receipt-indian-rupee',
  Income: 'lucide-coins',
  Liability: 'lucide-hand-coins',
};

// ERPNext's order of the root types, as its balance sheet lists them.
const ROOT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

function sortRoots(roots: AccountItem[]): AccountItem[] {
  const rank = (root: AccountItem) => ROOT_TYPES.indexOf(root.root_type);
  return roots.sort((a, b) => rank(a) - rank(b));
}

/** The first root and its first group, which accessory mode opens at first. */
function getFirstBranch(roots: AccountItem[]): string[] {
  const root = roots[0];
  const group = root?.children.find((child) => child.children.length);
  return [root?.name, group?.name].filter((name): name is string => !!name);
}

export default defineComponent({
  components: {
    EmptyState,
    FrappeAlert,
    FrappeBadge,
    FrappeButton,
    FrappePageHeaderBackButton,
    PageHeader,
    FrappeScrollArea,
    Skeleton,
    FrappeTextInput,
    FrappeTree,
    FrappeDialog,
    FrappeDropdown,
  },
  data() {
    return {
      addingParent: null as AccountItem | null,
      root: null as null | { label: string; balance: number; currency: string },
      accounts: [] as AccountItem[],
      expandedAccounts: [] as string[],
      schemaName: 'Account',
      newAccountName: '',
      insertingAccount: false,
      balances: {} as Record<string, number>,
      creditRootTypes: [] as string[],
      settings: null as null | TreeViewSettings,
      error: '',
    };
  },
  setup() {
    // Accessory mode shows the ERPNext tree of its company, read only.
    const isAccessory = isAccessoryMode();
    return {
      isMobile,
      isAccessory,
      company: isAccessory ? getAccessoryCompany() : undefined,
    };
  },
  computed: {
    /** Balances total the ledger. */
    canReadLedger(): boolean {
      return fyo.can(ModelNameEnum.GLEntry, 'read');
    },
    canEditTree(): boolean {
      return !this.isAccessory && fyo.can(ModelNameEnum.Account, 'create');
    },
    /** Accounts a phone lists: each open group's children under it, indented by depth. */
    visibleRows(): { account: AccountItem; depth: number }[] {
      const rows: { account: AccountItem; depth: number }[] = [];
      const add = (nodes: AccountItem[], depth: number) => {
        for (const account of nodes) {
          rows.push({ account, depth });
          if (this.isExpanded(account)) {
            add(account.children, depth + 1);
          }
        }
      };
      add(this.accounts, 0);
      return rows;
    },
    isAllExpanded(): boolean {
      return this.getGroups(this.accounts).every((account) =>
        this.isExpanded(account)
      );
    },
    isAllCollapsed(): boolean {
      return this.accounts.every((account) => !this.isExpanded(account));
    },
    newAccountActions(): DialogAction[] {
      const parent = this.addingParent;
      return [
        { label: t`Cancel`, onClick: () => this.cancelAddingAccount(parent) },
        {
          label: t`Save`,
          variant: 'solid',
          disabled: !this.newAccountName.trim() || this.insertingAccount,
          onClick: async () => {
            if (parent) {
              await this.createNewAccount(parent, parent.addingGroupAccount);
            }
          },
        },
      ];
    },
    newAccountTitle(): string {
      return this.addingParent?.addingGroupAccount
        ? t`Add group`
        : t`Add account`;
    },
  },
  async activated() {
    docsPathRef.value = docsPathMap.ChartOfAccounts!;
    try {
      await Promise.all([
        this.fetchAccounts(),
        this.canReadLedger ? this.setBalances() : undefined,
      ]);
    } catch (error) {
      this.error = serverHtmlToText(
        error instanceof Error ? error.message : String(error)
      );
    }
  },
  deactivated() {
    docsPathRef.value = '';
  },
  methods: {
    accountLabel(name: string) {
      return getLinkLabel(ModelNameEnum.Account, name);
    },
    getAccountActions(account: AccountItem): DropdownOptions {
      const actions: DropdownOptions = [];
      if (this.isAccessory) {
        return actions;
      }

      if (account.is_group && fyo.can(ModelNameEnum.Account, 'create')) {
        actions.push(
          {
            label: t`Add account`,
            onClick: () => this.addAccount(account, 'addingAccount'),
          },
          {
            label: t`Add group`,
            onClick: () => this.addAccount(account, 'addingGroupAccount'),
          }
        );
      }

      if (account.parent_account && fyo.can(ModelNameEnum.Account, 'delete')) actions.push({
        label: account.is_group ? t`Delete group` : t`Delete account`,
        theme: 'red',
        onClick: () => this.deleteAccount(account),
      });
      return actions;
    },
    expand() {
      (this.$refs.tree as TreeExposed).expandAll();
    },
    collapse() {
      (this.$refs.tree as TreeExposed).collapseAll();
    },
    isExpanded(account: AccountItem) {
      return this.expandedAccounts.includes(account.name);
    },
    setExpanded(account: AccountItem, expanded: boolean) {
      const others = this.expandedAccounts.filter(
        (name) => name !== account.name
      );
      this.expandedAccounts = expanded ? [...others, account.name] : others;
    },
    /** Accessory mode also totals each group's accounts. */
    showsBalance(account: AccountItem): boolean {
      return this.canReadLedger && (!account.is_group || this.isAccessory);
    },
    getBalance(account: AccountItem): number {
      const own = this.balances[account.name] ?? 0;
      if (!this.isAccessory) {
        return own;
      }

      return account.children.reduce(
        (total, child) => total + this.getBalance(child),
        own
      );
    },
    /** A balance on the other side than its root type keeps shows as a positive amount of that side. */
    getBalanceString(account: AccountItem) {
      const balance = this.getBalance(account);
      const keepsCredit = this.creditRootTypes.includes(account.root_type);
      const isCredit = balance < 0 ? !keepsCredit : keepsCredit;
      const amount = fyo.format(Math.abs(balance), 'Currency');
      return `${amount} ${isCredit ? t`Cr.` : t`Dr.`}`;
    },
    /** Balances are signed on the server by the side each root type keeps. */
    async setBalances() {
      const { balances, credit_root_types } = await call<{
        balances: Record<string, number>;
        credit_root_types: string[];
      }>('frappe_books.reports.financial_statements.get_account_balances');
      this.balances = balances;
      this.creditRootTypes = credit_root_types;
    },
    async fetchAccounts() {
      this.settings =
        getModel(ModelNameEnum.Account)?.getTreeSettings(fyo) ?? null;
      const currency = this.fyo.singles.SystemSettings?.currency ?? '';
      const label = (await this.settings?.getRootLabel()) ?? '';
      const nodes = (await this.getAccounts()).map((account) => ({
        ...account,
        children: [],
      }));
      const byName = new Map(nodes.map((node) => [node.name, node]));
      const roots: AccountItem[] = [];
      for (const node of nodes) {
        const parent = byName.get(node.parent_account);
        (parent?.children ?? roots).push(node);
      }

      const isFirstLoad = !this.root;
      this.accounts = this.isAccessory ? sortRoots(roots) : roots;
      if (this.isAccessory && isFirstLoad) {
        this.expandedAccounts = getFirstBranch(this.accounts);
      }

      // Set last: the tree shows once its accounts are in.
      this.root = {
        label,
        balance: 0,
        currency,
      };
    },
    async onClick(account: AccountItem) {
      let shouldOpen = !account.is_group;
      if (account.is_group) {
        shouldOpen = !(await this.toggleChildren(account));
      }

      if (!shouldOpen) {
        return;
      }

      const doc = await getFrappeDoc(ModelNameEnum.Account, account.name);
      this.setOpenAccountDocListener(doc, account);
      await openQuickEdit({ doc });
    },
    setOpenAccountDocListener(
      doc: FrappeDoc,
      account?: AccountItem,
      parentAccount?: AccountItem
    ) {
      if (doc.hasListener('afterDelete')) {
        return;
      }

      doc.once('afterDelete', () => {
        this.removeAccount(doc.name!, account, parentAccount);
      });
    },
    async deleteAccount(account: AccountItem) {
      const canDelete = await this.canDeleteAccount(account);
      if (!canDelete) {
        return;
      }

      const doc = await getFrappeDoc(ModelNameEnum.Account, account.name);
      this.setOpenAccountDocListener(doc, account);

      await commonDocDelete(doc, false);
    },
    async addRootGroup() {
      const doc = newFrappeDoc(ModelNameEnum.Account, { is_group: true });
      doc.once('afterSync', () => this.fetchAccounts());
      await openQuickEdit({ doc });
    },
    async canDeleteAccount(account: AccountItem) {
      if (!account.parent_account) {
        await showDialog({
          type: 'error',
          title: t`Cannot delete account`,
          detail: t`Root accounts cannot be deleted.`,
        });
        return false;
      }
      if (account.is_group && !account.children?.length) {
        await this.fetchChildren(account);
      }

      if (!account.children?.length) {
        return true;
      }

      await showDialog({
        type: 'error',
        title: t`Cannot delete account`,
        detail: t`${account.name} has linked child accounts.`,
      });

      return false;
    },
    removeAccount(
      name: string,
      account?: AccountItem,
      parentAccount?: AccountItem
    ) {
      if (account == null && parentAccount == null) {
        return;
      }

      if (account == null && parentAccount) {
        account = parentAccount.children.find((ch) => ch?.name === name);
      }

      if (account == null) {
        return;
      }

      const remove = (siblings: AccountItem[]): boolean => {
        const index = siblings.findIndex((item) => item.name === name);
        if (index >= 0) {
          siblings.splice(index, 1);
          return true;
        }
        return siblings.some((item) => remove(item.children ?? []));
      };
      remove(this.accounts);
    },
    async toggleChildren(account: AccountItem) {
      const hasChildren = await this.fetchChildren(account);
      if (!hasChildren) {
        return false;
      }

      const expanded = !this.isExpanded(account);
      this.setExpanded(account, expanded);
      if (!expanded) {
        account.addingAccount = false;
        account.addingGroupAccount = false;
      }

      return true;
    },
    async fetchChildren(account: AccountItem, force = false) {
      if (account.children == null || force) {
        const previous = new Map(
          (account.children ?? []).map((child) => [child.name, child])
        );
        account.children = (await this.getChildren(account.name)).map(
          (child) => {
            const existing = previous.get(child.name);
            return existing
              ? Object.assign(existing, { label: this.accountLabel(child.name) })
              : child;
          }
        );
      }

      return !!account?.children?.length;
    },
    async getChildren(parent: string): Promise<AccountItem[]> {
      const children = await this.getAccounts([
        ['parent_account', '=', parent],
      ]);
      return children.map((child) => ({
        ...child,
        addingAccount: false,
        addingGroupAccount: false,
      }));
    },
    /** Every account the filters match, by name (accessory mode: the company's, in tree order), labelled in the user's language. */
    async getAccounts(filters: string[][] = []): Promise<AccountItem[]> {
      const accounts = await call<AccountItem[]>('frappe.client.get_list', {
        doctype: getDocType(ModelNameEnum.Account).doctype,
        fields: ACCOUNT_FIELDS,
        filters: this.isAccessory
          ? [...filters, ['company', '=', this.company ?? '']]
          : filters,
        order_by: this.isAccessory ? 'lft asc' : 'name asc',
        limit_page_length: 0,
      });
      return accounts.map((account) => ({
        ...account,
        label: this.accountLabel(account.name),
      }));
    },
    async addAccount(parentAccount: AccountItem, key: AccKey) {
      if (!this.isExpanded(parentAccount)) {
        await this.fetchChildren(parentAccount);
        this.setExpanded(parentAccount, true);
      }
      // activate editing of type 'key' and deactivate other type
      let otherKey: AccKey =
        key === 'addingAccount' ? 'addingGroupAccount' : 'addingAccount';
      parentAccount[key] = true;
      parentAccount[otherKey] = false;

      this.addingParent = parentAccount;
      await nextTick();
      (this.$refs.newAccount as { focus: () => void } | undefined)?.focus();
    },
    cancelAddingAccount(parentAccount: AccountItem | null) {
      if (!parentAccount) return;
      this.addingParent = null;
      parentAccount.addingAccount = false;
      parentAccount.addingGroupAccount = false;
      this.newAccountName = '';
    },
    async createNewAccount(parentAccount: AccountItem, isGroup: boolean) {
      if (this.insertingAccount || !this.newAccountName.trim()) return;
      // freeze input
      this.insertingAccount = true;

      const accountName = this.newAccountName.trim();
      const doc = newFrappeDoc(ModelNameEnum.Account);
      try {
        const { name, root_type, account_type } = parentAccount;
        await doc.set({
          account_name: accountName,
          parent_account: name,
          root_type,
          account_type,
          is_group: isGroup,
        });
        await doc.sync();
      } catch (e) {
        await handleErrorWithDialog(e, doc, true);
        return;
      } finally {
        this.insertingAccount = false;
      }

      this.cancelAddingAccount(parentAccount);
      try {
        await this.fetchChildren(parentAccount, true);
        await openQuickEdit({ doc });
        this.setOpenAccountDocListener(doc, undefined, parentAccount);
      } catch (error) {
        fyo.reportDocumentActionWarning(doc, 'save', [error]);
      }
    },
    getAccountIconName(account: AccountItem): string {
      const rootIcon = account.parent_account
        ? undefined
        : rootAccountIcons[account.root_type];
      return rootIcon ?? (account.is_group ? 'lucide-folder' : 'lucide-circle');
    },
    getGroups(accounts: AccountItem[]): AccountItem[] {
      return accounts.flatMap((account) => [
        ...(account.children?.length ? [account] : []),
        ...this.getGroups(account.children ?? []),
      ]);
    },
  },
});
</script>

