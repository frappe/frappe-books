<script lang="ts">
import type { TargetField } from 'schemas/types';
import { defineComponent } from 'vue';
import TableMultiSelect from './TableMultiSelect.vue';

/** A report filter's MultiSelectList: a list of record names, picked as a set. */
export default defineComponent({
  name: 'MultiSelectList',
  extends: TableMultiSelect,
  computed: {
    /** The records the list picks from: its target, searched by its link filters. */
    linkField(): TargetField {
      return { ...(this.df as TargetField), fieldtype: 'Link' };
    },
    picked(): string[] {
      return Array.isArray(this.value) ? (this.value as string[]) : [];
    },
  },
  methods: {
    setPicked(names: (string | number)[]) {
      this.triggerChange(names.map(String));
    },
  },
});
</script>
