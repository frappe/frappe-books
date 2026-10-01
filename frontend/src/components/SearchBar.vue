<template>
  <FrappeButton
    icon="lucide-search"
    variant="ghost"
    :tooltip="t`Search`"
    :aria-label="t`Search`"
    @click="open"
  />

  <!-- Search Modal -->
  <CommandPalette
    v-model:open="openModal"
    v-model:query="query"
    :filterable="false"
    :title="t`Search Frappe Books`"
    @select="selectSearchItem"
  >
    <CommandPaletteInput :placeholder="t`Type to search...`" />

    <!-- Search List -->
    <CommandPaletteList class="py-2.5 scroll-py-2.5 empty:py-0">
      <CommandPaletteItem
        v-for="(si, i) in suggestions"
        :key="`${i}-${si.label}`"
        :value="si"
        :label="si.label"
      >
        <!-- Search List Item -->
        <span class="flex min-w-0 items-baseline gap-2">
          <span class="truncate">{{ si.label }}</span>
          <span
            v-if="si.group === 'Docs'"
            class="min-w-0 truncate text-sm text-ink-gray-5"
          >
            {{ si.more.filter(Boolean).join(', ') }}
          </span>
        </span>
        <template #suffix>
          <FrappeBadge :theme="groupThemeMap[si.group]" variant="subtle">
            {{ si.group === 'Docs' ? si.schemaLabel : groupLabelMap[si.group] }}
          </FrappeBadge>
        </template>
      </CommandPaletteItem>
    </CommandPaletteList>

    <CommandPaletteEmpty>{{ t`No results` }}</CommandPaletteEmpty>

    <!-- Footer -->
    <CommandPaletteFooter>
      <div class="flex min-w-0 w-full flex-col gap-3 text-sm select-none">
        <!-- Group Filters -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap gap-1.5">
            <FrappeButton
              v-for="g in searchGroups"
              :key="g"
              size="xs"
              :variant="isFilterOn(g) ? 'subtle' : 'outline'"
              :aria-pressed="isFilterOn(g)"
              @click="setSearchFilter(g, !isFilterOn(g))"
            >
              {{ groupLabelMap[g] }}
            </FrappeButton>
          </div>
          <FrappeButton
            class="ms-auto shrink-0"
            size="xs"
            variant="ghost"
            :aria-expanded="showMore"
            @click="showMore = !showMore"
          >
            {{ showMore ? t`Less Filters` : t`More Filters` }}
          </FrappeButton>
        </div>

        <!-- Additional Filters -->
        <div v-if="showMore" class="flex max-h-40 flex-col gap-2 overflow-y-auto">
          <!-- Group Skip Filters -->
          <div class="flex flex-wrap gap-1.5">
            <FrappeButton
              v-for="s in ['skipTables', 'skipTransactions'] as const"
              :key="s"
              size="xs"
              :variant="isFilterOn(s) ? 'subtle' : 'outline'"
              :aria-pressed="isFilterOn(s)"
              @click="setSearchFilter(s, !isFilterOn(s))"
            >
              {{
                s === 'skipTables' ? t`Skip Child Tables` : t`Skip Transactions`
              }}
            </FrappeButton>
          </div>

          <!-- Schema Name Filters -->
          <div class="flex flex-wrap gap-1.5">
            <FrappeButton
              v-for="sf in schemaFilters"
              :key="sf.value"
              class="whitespace-nowrap"
              size="xs"
              theme="blue"
              :variant="isFilterOn(sf.value) ? 'subtle' : 'outline'"
              :aria-pressed="isFilterOn(sf.value)"
              @click="setSearchFilter(sf.value, !isFilterOn(sf.value))"
            >
              {{ sf.label }}
            </FrappeButton>
          </div>
        </div>

        <!-- Keybindings Help -->
        <div
          class="flex flex-wrap items-center justify-between gap-2 text-ink-gray-5"
        >
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p class="flex h-7 items-center gap-1 whitespace-nowrap">
              <FrappeKeyboardShortcut combo="ArrowUp" />
              <FrappeKeyboardShortcut combo="ArrowDown" />
              {{ t`Navigate` }}
            </p>
            <p class="flex h-7 items-center gap-1 whitespace-nowrap">
              <FrappeKeyboardShortcut combo="Enter" /> {{ t`Select` }}
            </p>
            <p class="flex h-7 items-center gap-1 whitespace-nowrap">
              <FrappeKeyboardShortcut combo="Escape" /> {{ t`Close` }}
            </p>
            <FrappeButton
              size="xs"
              variant="ghost"
              icon-left="lucide-circle-help"
              @click="openDocs"
            >
              {{ t`Help` }}
            </FrappeButton>
          </div>

          <div class="ms-auto flex items-center gap-2 whitespace-nowrap">
            <p v-if="results.length">
              {{ t`${suggestions.length} out of ${results.length}` }}
            </p>
            <FrappeTabButtons
              v-if="results.length > 50"
              v-model="limit"
              :aria-label="t`Result limit`"
              size="sm"
              :options="limitOptions"
            />
          </div>
        </div>
      </div>
    </CommandPaletteFooter>
  </CommandPalette>
</template>

<script lang="ts">
import { shortcutsKey } from 'src/utils/injectionKeys';
import { docsPathMap } from 'src/utils/misc';
import {
  SearchGroup,
  SearchItems,
  getGroupLabelMap,
  groupThemeMap,
  searchGroups,
} from 'src/utils/search';
import { useSearch } from 'src/utils/useSearch';
import { defineComponent, inject } from 'vue';
import {
  Badge as FrappeBadge,
  Button as FrappeButton,
  KeyboardShortcut as FrappeKeyboardShortcut,
  TabButtons as FrappeTabButtons,
} from 'frappe-ui';
import {
  CommandPalette,
  CommandPaletteEmpty,
  CommandPaletteFooter,
  CommandPaletteInput,
  CommandPaletteItem,
  CommandPaletteList,
  type CommandPaletteValue,
} from 'frappe-ui-command-palette';

const COMPONENT_NAME = 'SearchBar';

export default defineComponent({
  components: {
    CommandPalette,
    CommandPaletteEmpty,
    CommandPaletteFooter,
    CommandPaletteInput,
    CommandPaletteItem,
    CommandPaletteList,
    FrappeBadge,
    FrappeButton,
    FrappeKeyboardShortcut,
    FrappeTabButtons,
  },
  setup() {
    return {
      ...useSearch(),
      groupThemeMap,
      shortcuts: inject(shortcutsKey),
    };
  },
  data() {
    return {
      searchGroups,
      openModal: false,
      showMore: false,
      limit: 50,
      allowedLimits: [50, 100, 500, -1],
    };
  },
  computed: {
    limitOptions() {
      return this.allowedLimits
        .filter(
          (limit) =>
            limit < this.results.length || limit === this.limit || limit === -1
        )
        .map((value) => ({
          value,
          label: value === -1 ? this.t`All` : String(value),
        }));
    },
    groupLabelMap(): Record<SearchGroup, string> {
      return getGroupLabelMap();
    },
    schemaFilters() {
      return this.searcher?.schemaFilterOptions ?? [];
    },
    suggestions(): SearchItems {
      return this.limit === -1
        ? this.results
        : this.results.slice(0, this.limit);
    },
  },
  async mounted() {
    this.openModal = false;
    this.setShortcuts();
  },
  activated() {
    this.setShortcuts();
    this.openModal = false;
  },
  deactivated() {
    this.shortcuts?.delete(COMPONENT_NAME);
  },
  unmounted() {
    this.shortcuts?.delete(COMPONENT_NAME);
  },
  watch: {
    openModal(open: boolean) {
      if (open) {
        this.setShortcuts();
        return;
      }

      this.clearFilterShortcuts();
      this.reset();
    },
  },
  methods: {
    openDocs() {
      window.open(
        'https://docs.frappe.io/' + docsPathMap.Search,
        '_blank',
        'noopener,noreferrer'
      );
    },
    getShortcuts() {
      const shortcuts: { shortcut: string; callback: () => void }[] = [];

      for (const i in searchGroups) {
        shortcuts.push({
          shortcut: `Digit${Number(i) + 1}`,
          callback: () => {
            const group = searchGroups[i];
            this.setSearchFilter(group, !this.isFilterOn(group));
          },
        });
      }

      return shortcuts;
    },
    setShortcuts() {
      if (!this.shortcuts) {
        return;
      }

      this.shortcuts.pmod.set(COMPONENT_NAME, ['KeyK'], () => {
        if (!this.openModal) {
          this.open();
        }
      });

      if (!this.openModal) {
        return;
      }

      for (const { shortcut, callback } of this.getShortcuts()) {
        this.shortcuts.pmod.set(COMPONENT_NAME, [shortcut], callback);
      }
    },
    clearFilterShortcuts() {
      for (const { shortcut } of this.getShortcuts()) {
        this.shortcuts?.pmod.delete(COMPONENT_NAME, [shortcut]);
      }
    },
    open(): void {
      this.openModal = true;
      this.setShortcuts();
    },
    close(): void {
      this.clearFilterShortcuts();
      this.openModal = false;
      this.reset();
    },
    reset(): void {
      this.query = '';
    },
    selectSearchItem(value: CommandPaletteValue): void {
      this.openSearchItem(value as SearchItems[number]);
    },
  },
});
</script>
