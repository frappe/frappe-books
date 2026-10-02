<template>
  <div
    class="grid max-h-[70vh] grid-cols-1 gap-8 gap-x-6 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3"
  >
    <div v-for="g in groups" :key="g.label" class="space-y-1">
      <h3 class="text-base-medium text-ink-gray-8">
        {{ g.label }}
      </h3>
      <p class="mb-3 text-p-sm text-ink-gray-5">{{ g.description }}</p>
      <div
        v-for="(s, i) in g.shortcuts"
        :key="g.label + ' ' + i"
        class="grid grid-cols-[1fr_auto] items-start gap-3 rounded-4 py-0.5"
      >
        <span class="text-p-base text-ink-gray-6">{{ s.description }}</span>
        <ShortcutKeys :keys="s.shortcut" />
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import { t } from 'fyo';
import { ShortcutKey } from 'src/utils/ui';
import { defineComponent } from 'vue';
import ShortcutKeys from './ShortcutKeys.vue';

type Group = {
  label: string;
  description: string;
  shortcuts: { shortcut: string[]; description: string }[];
};

export default defineComponent({
  components: { ShortcutKeys },
  data() {
    return { groups: [] } as { groups: Group[] };
  },
  mounted() {
    this.groups = [
      {
        label: t`Global`,
        description: t`Applicable anywhere in Frappe Books`,
        shortcuts: [
          {
            shortcut: [ShortcutKey.pmod, 'K'],
            description: t`Open Quick Search`,
          },
          {
            shortcut: [ShortcutKey.shift, ShortcutKey.delete],
            description: t`Go back to the previous page`,
          },
          {
            shortcut: [ShortcutKey.shift, 'H'],
            description: t`Toggle sidebar`,
          },
          {
            shortcut: ['F1'],
            description: t`Open Documentation`,
          },
        ],
      },
      {
        label: t`Entry`,
        description: t`Applicable when a entry is open in the Form view or Quick Edit view`,
        shortcuts: [
          {
            shortcut: [ShortcutKey.pmod, 'S'],
            description: [
              t`Save or Submit an entry.`,
              t`An entry is submitted only if it is submittable and is in the saved state.`,
            ].join(' '),
          },
          {
            shortcut: [ShortcutKey.pmod, ShortcutKey.delete],
            description: [
              t`Cancel or Delete an entry.`,
              t`An entry is cancelled only if it is in the submitted state.`,
              t`A submittable entry is deleted only if it is in the cancelled state.`,
            ].join(' '),
          },
          {
            shortcut: [ShortcutKey.pmod, 'P'],
            description: t`Open Print View if Print is available.`,
          },
          {
            shortcut: [ShortcutKey.pmod, 'L'],
            description: t`Toggle Linked Entries widget, not available in Quick Edit view.`,
          },
        ],
      },
      {
        label: t`List View`,
        description: t`Applicable when the List View of an entry type is open`,
        shortcuts: [
          {
            shortcut: [ShortcutKey.pmod, 'N'],
            description: t`Create a new entry of the same type as the List View`,
          },
          {
            shortcut: [ShortcutKey.pmod, 'E'],
            description: t`Open the Export Wizard modal`,
          },
        ],
      },
      {
        label: t`Quick Search`,
        description: t`Applicable when Quick Search is open`,
        shortcuts: [
          { shortcut: [ShortcutKey.esc], description: t`Close Quick Search` },
          {
            shortcut: [ShortcutKey.pmod, '1'],
            description: t`Toggle the Docs filter`,
          },
          {
            shortcut: [ShortcutKey.pmod, '2'],
            description: t`Toggle the List filter`,
          },
          {
            shortcut: [ShortcutKey.pmod, '3'],
            description: t`Toggle the Create filter`,
          },
          {
            shortcut: [ShortcutKey.pmod, '4'],
            description: t`Toggle the Report filter`,
          },
          {
            shortcut: [ShortcutKey.pmod, '5'],
            description: t`Toggle the Page filter`,
          },
        ],
      },
      {
        label: t`Template Builder`,
        description: t`Applicable when Template Builder is open`,
        shortcuts: [
          {
            shortcut: [ShortcutKey.ctrl, ShortcutKey.enter],
            description: t`Apply and view changes made to the print template`,
          },
          {
            shortcut: [ShortcutKey.ctrl, 'E'],
            description: t`Toggle Edit Mode`,
          },
          {
            shortcut: [ShortcutKey.ctrl, 'H'],
            description: t`Toggle Key Hints`,
          },
          {
            shortcut: [ShortcutKey.ctrl, '+'],
            description: t`Increase print template display scale`,
          },
          {
            shortcut: [ShortcutKey.ctrl, '-'],
            description: t`Decrease print template display scale`,
          },
        ],
      },
      {
        label: t`Point of Sale`,
        description: t`Applicable when POS is open`,
        shortcuts: [
          {
            shortcut: [ShortcutKey.shift, 'V'],
            description: t`Toggle between Grid and List view`,
          },
          {
            shortcut: [ShortcutKey.shift, 'S'],
            description: t`Open Sales Invoice List`,
          },
          {
            shortcut: [ShortcutKey.shift, 'L'],
            description: t`Set Loyalty Program`,
          },
          {
            shortcut: [ShortcutKey.shift, 'C'],
            description: t`Set Coupon Code`,
          },
          {
            shortcut: [ShortcutKey.shift, 'P'],
            description: t`Set Price List`,
          },
          {
            shortcut: ['Q', '0-9'],
            description: t`Hold Q and type digits to set selected item quantity`,
          },
          {
            shortcut: [ShortcutKey.pmod, ShortcutKey.shift, 'H'],
            description: t`Open Saved or Submitted Invoice List.`,
          },
          {
            shortcut: [ShortcutKey.pmod, ShortcutKey.shift, 'S'],
            description: t`If any entry form is open, save the details. Otherwise, save the invoice.`,
          },
          {
            shortcut: [ShortcutKey.pmod, ShortcutKey.shift, 'P'],
            description: t`Create Payment.`,
          },
          {
            shortcut: [ShortcutKey.pmod, ShortcutKey.shift, ShortcutKey.delete],
            description: t`If any entry form is open, your entry will be canceled. Otherwise the selected items will be removed.`,
          },
        ],
      },
    ];
  },
});
</script>
