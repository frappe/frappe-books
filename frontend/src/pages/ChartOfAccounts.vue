<template>
  <div class="flex flex-col h-full">
    <PageHeader :title="t`Chart of Accounts`">
      <Button @click="addRootGroup">{{ t`Add Root Group` }}</Button>
      <Button v-if="!isAllExpanded" @click="expand">{{ t`Expand` }}</Button>
      <Button v-if="!isAllCollapsed" @click="collapse">{{
        t`Collapse`
      }}</Button>
    </PageHeader>
    <div
      v-if="root"
      class="books-account-tree relative flex-1 overflow-y-auto p-4 custom-scroll custom-scroll-thumb1"
    >
      <FrappeTree
        :nodes="accounts"
        node-key="name"
        :aria-label="t`Chart of Accounts`"
      >
        <template #item-prefix="{ node }">
          <Icon
            :name="getAccountIconName(!!node.isGroup, String(node.name))"
            :size="16"
          />
        </template>
        <template #item-label="{ node }">
          <button
            type="button"
            class="min-w-0 flex-1 self-stretch truncate rounded-3 bg-transparent text-start text-base text-ink-gray-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline-gray-3"
            :class="node.isGroup ? 'font-medium' : 'font-normal'"
            :title="getAccountLabel(String(node.name))"
            @keydown.enter.stop
            @keydown.space.stop
            @click.stop="onClick(node as AccountItem)"
          >
            {{ getAccountLabel(String(node.name)) }}
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
                  <Button
                    :background="false"
                    :icon="true"
                    size="xs"
                    :title="t`Actions for ${String(node.name)}`"
                    :class="
                      open
                        ? 'opacity-100'
                        : 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100'
                    "
                  >
                    <Icon name="more-horizontal" :size="14" />
                  </Button>
                </template>
              </FrappeDropdown>
            </div>
            <span
              v-if="!node.isGroup"
              class="min-w-24 text-end text-base tabular-nums text-ink-gray-7"
              >{{ getBalanceString(node as AccountItem) }}</span
            >
          </div>
        </template>
      </FrappeTree>
    </div>
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
        <Button @click="cancelAddingAccount(addingParent)">{{
          t`Cancel`
        }}</Button>
        <Button
          type="primary"
          :loading="insertingAccount"
          :disabled="!newAccountName.trim() || insertingAccount"
          @click="
            addingParent &&
            createNewAccount(addingParent, addingParent.addingGroupAccount)
          "
          >{{ t`Save` }}</Button
        >
      </template>
    </FrappeDialog>
  </div>
</template>
<script lang="ts">
import { t } from 'fyo';
import { getAccountLabel } from 'src/utils/accountLabel';
import {
  Dialog as FrappeDialog,
  Dropdown as FrappeDropdown,
  TextInput as FrappeTextInput,
  Tree as FrappeTree,
  type DropdownOptions,
} from 'frappe-ui';
import { isCredit } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import Icon from 'src/components/Icon.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { fyo } from 'src/initFyo';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { commongDocDelete, openQuickEdit } from 'src/utils/ui';
import { getMapFromList } from 'utils/index';
import { defineComponent, nextTick } from 'vue';
import Button from '../components/Button.vue';
import { handleErrorWithDialog } from '../errorHandling';
import { AccountRootType, AccountType } from 'models/baseModels/Account/types';
import { TreeViewSettings } from 'fyo/model/types';
import { Doc } from 'fyo/model/doc';
import { showDialog } from 'src/utils/interactive';

type AccountItem = {
  [key: string]: unknown;
  label: string;
  name: string;
  parentAccount: string;
  rootType: AccountRootType;
  accountType: AccountType;
  isGroup?: boolean;
  children: AccountItem[];
  expanded: boolean;
  addingAccount: boolean;
  addingGroupAccount: boolean;
};

type AccKey = 'addingAccount' | 'addingGroupAccount';

const rootAccountIcons: Record<string, string> = {
  'Application of Funds (Assets)': 'landmark',
  Expenses: 'receipt-indian-rupee',
  Income: 'coins',
  'Source of Funds (Liabilities)': 'hand-coins',
};

export default defineComponent({
  components: {
    Button,
    Icon,
    PageHeader,
    FrappeTextInput,
    FrappeTree,
    FrappeDialog,
    FrappeDropdown,
  },
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data() {
    return {
      addingParent: null as AccountItem | null,
      root: null as null | { label: string; balance: number; currency: string },
      accounts: [] as AccountItem[],
      schemaName: 'Account',
      newAccountName: '',
      insertingAccount: false,
      totals: {} as Record<string, { totalDebit: number; totalCredit: number }>,
      settings: null as null | TreeViewSettings,
    };
  },
  computed: {
    isAllExpanded(): boolean {
      return this.getGroups(this.accounts).every((account) => account.expanded);
    },
    isAllCollapsed(): boolean {
      return this.accounts.every((account) => !account.expanded);
    },
    newAccountTitle(): string {
      return this.addingParent?.addingGroupAccount
        ? t`Add Group`
        : t`Add Account`;
    },
  },
  async activated() {
    await this.fetchAccounts();
    await this.setTotalDebitAndCredit();
    if (fyo.store.isDevelopment) {
      // @ts-ignore
      window.coa = this;
    }

    docsPathRef.value = docsPathMap.ChartOfAccounts!;
  },
  deactivated() {
    docsPathRef.value = '';
  },
  methods: {
    getAccountLabel,
    getAccountActions(account: AccountItem): DropdownOptions {
      const actions: DropdownOptions = [];
      if (account.isGroup) {
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

      if (account.parentAccount) actions.push({
        label: account.isGroup ? t`Delete Group` : t`Delete Account`,
        theme: 'red',
        onClick: () => this.deleteAccount(account),
      });
      return actions;
    },
    async expand() {
      await this.toggleAll(this.accounts, true);
    },
    async collapse() {
      await this.toggleAll(this.accounts, false);
    },
    async toggleAll(accounts: AccountItem | AccountItem[], expand: boolean) {
      if (!Array.isArray(accounts)) {
        await this.toggle(accounts, expand);
        accounts = accounts.children ?? [];
      }

      for (const account of accounts) {
        await this.toggleAll(account, expand);
      }
    },
    async toggle(account: AccountItem, expand: boolean) {
      if (account.expanded === expand || !account.isGroup) {
        return;
      }

      await this.toggleChildren(account);
    },
    getBalance(account: AccountItem) {
      const total = this.totals[account.name];
      if (!total) {
        return 0;
      }

      const { totalCredit, totalDebit } = total;

      if (isCredit(account.rootType)) {
        return totalCredit - totalDebit;
      }

      return totalDebit - totalCredit;
    },
    getBalanceString(account: AccountItem) {
      const suffix = isCredit(account.rootType) ? t`Cr.` : t`Dr.`;
      const balance = this.getBalance(account);
      return `${fyo.format(balance, 'Currency')} ${suffix}`;
    },
    async setTotalDebitAndCredit() {
      const totals = await this.fyo.db.getTotalCreditAndDebit();
      this.totals = getMapFromList(totals, 'account');
    },
    async fetchAccounts() {
      this.settings =
        fyo.models[ModelNameEnum.Account]?.getTreeSettings(fyo) ?? null;
      const currency = this.fyo.singles.SystemSettings?.currency ?? '';
      const label = (await this.settings?.getRootLabel()) ?? '';

      this.root = {
        label,
        balance: 0,
        currency,
      };
      const records = await fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name', 'parentAccount', 'isGroup', 'rootType', 'accountType'],
        orderBy: 'name',
        order: 'asc',
      });
      const nodes = records.map((record) => ({
        ...record,
        label: getAccountLabel(String(record.name)),
        expanded: false,
        children: [],
      })) as unknown as AccountItem[];
      const byName = new Map(nodes.map((node) => [node.name, node]));
      this.accounts = [];
      for (const node of nodes) {
        const parent = byName.get(node.parentAccount);
        (parent?.children ?? this.accounts).push(node);
      }
    },
    async onClick(account: AccountItem) {
      let shouldOpen = !account.isGroup;
      if (account.isGroup) {
        shouldOpen = !(await this.toggleChildren(account));
      }

      if (!shouldOpen) {
        return;
      }

      const doc = await fyo.doc.getDoc(ModelNameEnum.Account, account.name);
      this.setOpenAccountDocListener(doc, account);
      await openQuickEdit({ doc });
    },
    setOpenAccountDocListener(
      doc: Doc,
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

      const doc = await fyo.doc.getDoc(ModelNameEnum.Account, account.name);
      this.setOpenAccountDocListener(doc, account);

      await commongDocDelete(doc, false);
    },
    async addRootGroup() {
      const doc = fyo.doc.getNewDoc(ModelNameEnum.Account, { isGroup: true });
      doc.once('afterSync', () => this.fetchAccounts());
      await openQuickEdit({ doc });
    },
    async canDeleteAccount(account: AccountItem) {
      if (!account.parentAccount) {
        await showDialog({
          type: 'error',
          title: t`Cannot Delete Account`,
          detail: t`Root accounts cannot be deleted.`,
        });
        return false;
      }
      if (account.isGroup && !account.children?.length) {
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

      account.expanded = !account.expanded;
      if (!account.expanded) {
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
              ? Object.assign(existing, { label: getAccountLabel(child.name) })
              : child;
          }
        );
      }

      return !!account?.children?.length;
    },
    async getChildren(parent: null | string = null): Promise<AccountItem[]> {
      const children = await fyo.db.getAll(ModelNameEnum.Account, {
        filters: {
          parentAccount: parent,
        },
        fields: ['name', 'parentAccount', 'isGroup', 'rootType', 'accountType'],
        orderBy: 'name',
        order: 'asc',
      });

      return children.map((d) => {
        d.label = getAccountLabel(String(d.name));
        d.expanded = false;
        d.addingAccount = false;
        d.addingGroupAccount = false;

        return d as unknown as AccountItem;
      });
    },
    async addAccount(parentAccount: AccountItem, key: AccKey) {
      if (!parentAccount.expanded) {
        await this.fetchChildren(parentAccount);
        parentAccount.expanded = true;
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
      const doc = fyo.doc.getNewDoc('Account');
      try {
        let { name, rootType, accountType } = parentAccount;
        await doc.set({
          name: accountName,
          parentAccount: name,
          rootType,
          accountType,
          isGroup,
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
        (name && rootAccountIcons[name]) || (isGroup ? 'folder' : 'circle')
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

<style scoped>
.books-account-tree {
  --tree-row-height: 2.25rem;
}

.books-account-tree :deep([data-slot='row']) {
  gap: 0.5rem;
  padding-inline: 0.5rem;
}

.books-account-tree :deep([role='treeitem']:focus-visible) {
  outline: none;
}

.books-account-tree :deep([role='treeitem']:focus-visible > [data-slot='row']) {
  outline: 2px solid var(--outline-gray-3);
  outline-offset: -1px;
}
</style>
