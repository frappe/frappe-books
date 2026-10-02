<template>
  <div class="flex flex-col h-full">
    <PageHeader :title="t`Chart of Accounts`">
      <FrappeButton v-if="fyo.can('Account', 'create')" @click="addRootGroup">{{
        t`Add Root Group`
      }}</FrappeButton>
      <FrappeButton v-if="!isAllExpanded" @click="expand">{{ t`Expand` }}</FrappeButton>
      <FrappeButton v-if="!isAllCollapsed" @click="collapse">{{
        t`Collapse`
      }}</FrappeButton>
    </PageHeader>
    <FrappeScrollArea
      v-if="root"
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
            :class="getAccountIconName(!!node.is_group, String(node.name))"
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
            <div @click.stop @keydown.stop>
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
              v-if="!node.is_group"
              class="min-w-24 text-end text-base tabular-nums text-ink-gray-7"
              >{{ getBalanceString(node as AccountItem) }}</span
            >
          </div>
        </template>
      </FrappeTree>
    </FrappeScrollArea>
    <FrappeDialog
      :open="!!addingParent"
      :title="newAccountTitle"
      @close="cancelAddingAccount(addingParent)"
    >
      <p class="mb-4 text-p-sm text-ink-gray-6">
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
      <template #actions>
        <FrappeButton @click="cancelAddingAccount(addingParent)">{{
          t`Cancel`
        }}</FrappeButton>
        <FrappeButton
          variant="solid"
          :loading="insertingAccount"
          :disabled="!newAccountName.trim() || insertingAccount"
          @click="
            addingParent &&
            createNewAccount(addingParent, addingParent.addingGroupAccount)
          "
          >{{ t`Save` }}</FrappeButton>
      </template>
    </FrappeDialog>
  </div>
</template>
<script lang="ts">
import { t } from 'fyo';
import {
  Dialog as FrappeDialog,
  Dropdown as FrappeDropdown,
  ScrollArea as FrappeScrollArea,
  TextInput as FrappeTextInput,
  Tree as FrappeTree,
  type DropdownOptions,
  type TreeExposed,
  Button as FrappeButton,
} from 'frappe-ui';
import { ModelNameEnum } from 'models/types';
import PageHeader from 'src/components/PageHeader.vue';
import { getLinkLabel } from 'src/frappe/link';
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

type AccountItem = {
  [key: string]: unknown;
  label: string;
  name: string;
  parent_books_account: string;
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
  'parent_books_account',
  'is_group',
  'root_type',
  'account_type',
];

const rootAccountIcons: Record<string, string> = {
  'Application of Funds (Assets)': 'lucide-landmark',
  Expenses: 'lucide-receipt-indian-rupee',
  Income: 'lucide-coins',
  'Source of Funds (Liabilities)': 'lucide-hand-coins',
};

export default defineComponent({
  components: {
    FrappeButton,
    PageHeader,
    FrappeScrollArea,
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
    };
  },
  computed: {
    isAllExpanded(): boolean {
      return this.getGroups(this.accounts).every((account) =>
        this.isExpanded(account)
      );
    },
    isAllCollapsed(): boolean {
      return this.accounts.every((account) => !this.isExpanded(account));
    },
    newAccountTitle(): string {
      return this.addingParent?.addingGroupAccount
        ? t`Add Group`
        : t`Add Account`;
    },
  },
  async activated() {
    await this.fetchAccounts();
    await this.setBalances();

    docsPathRef.value = docsPathMap.ChartOfAccounts!;
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
      if (account.is_group && fyo.can(ModelNameEnum.Account, 'create')) {
        actions.push(
          {
            label: t`Add Account`,
            onClick: () => this.addAccount(account, 'addingAccount'),
          },
          {
            label: t`Add Group`,
            onClick: () => this.addAccount(account, 'addingGroupAccount'),
          }
        );
      }

      if (account.parent_books_account && fyo.can(ModelNameEnum.Account, 'delete')) actions.push({
        label: account.is_group ? t`Delete Group` : t`Delete Account`,
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
    getBalanceString(account: AccountItem) {
      const isCredit = this.creditRootTypes.includes(account.root_type);
      const balance = this.balances[account.name] ?? 0;
      return `${fyo.format(balance, 'Currency')} ${isCredit ? t`Cr.` : t`Dr.`}`;
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

      this.root = {
        label,
        balance: 0,
        currency,
      };
      const nodes = (await this.getAccounts()).map((account) => ({
        ...account,
        children: [],
      }));
      const byName = new Map(nodes.map((node) => [node.name, node]));
      this.accounts = [];
      for (const node of nodes) {
        const parent = byName.get(node.parent_books_account);
        (parent?.children ?? this.accounts).push(node);
      }
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
      if (!account.parent_books_account) {
        await showDialog({
          type: 'error',
          title: t`Cannot Delete Account`,
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
        title: t`Cannot Delete Account`,
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
        ['parent_books_account', '=', parent],
      ]);
      return children.map((child) => ({
        ...child,
        addingAccount: false,
        addingGroupAccount: false,
      }));
    },
    /** Every account the filters match, by name, labelled in the user's language. */
    async getAccounts(filters: string[][] = []): Promise<AccountItem[]> {
      const accounts = await call<AccountItem[]>('frappe.client.get_list', {
        doctype: 'Books Account',
        fields: ACCOUNT_FIELDS,
        filters,
        order_by: 'name asc',
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
          parent_books_account: name,
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
    getAccountIconName(isGroup: boolean, name?: string): string {
      return (
        (name && rootAccountIcons[name]) || (isGroup ? 'lucide-folder' : 'lucide-circle')
      );
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

