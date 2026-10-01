<template>
  <FrappeBottomSheet
    :open="open"
    :title="isPickingField ? t`Filter by` : t`Filters`"
    @update:open="onOpenChange"
  >
    <div class="px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
      <MobileFilterFieldList
        v-if="isPickingField"
        :fields="filters.fields"
        @pick="addFilter"
      />
      <div v-else class="flex flex-col gap-3">
        <div
          v-for="(row, index) in filters.explicitRows"
          :key="row.id"
          role="group"
          :aria-label="t`Filter ${index + 1}`"
          class="flex flex-col gap-2 rounded-6 border border-outline-gray-1 p-3"
        >
          <div
            class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_2.5rem] items-end gap-2"
          >
            <Select
              :border="true"
              :show-label="true"
              :df="{
                label: t`Field`,
                fieldname: 'fieldname',
                fieldtype: 'Select',
                options: filters.fieldOptions,
              }"
              :value="row.fieldname"
              @change="(value) => filters.update(row, 'fieldname', value)"
            />
            <Select
              :border="true"
              :show-label="true"
              :df="{
                label: t`Condition`,
                fieldname: 'condition',
                fieldtype: 'Select',
                options: filters.conditionsFor(row),
              }"
              :value="row.condition"
              @change="(value) => filters.update(row, 'condition', value)"
            />
            <FrappeButton
              variant="ghost"
              size="lg"
              icon="lucide-trash-2"
              :label="t`Remove filter ${index + 1}`"
              @click="filters.remove(row.id)"
            />
          </div>
          <FilterValueInput
            v-if="!isValuelessCondition(row.condition)"
            :key="row.fieldname"
            :field="filters.fieldFor(row)"
            :condition="row.condition"
            :value="row.value"
            :filters="filters.filterSet.rows"
            @change="(value) => filters.update(row, 'value', value)"
            @apply="apply"
          />
        </div>
        <FrappeButton
          variant="ghost"
          size="lg"
          icon-left="lucide-plus"
          class="self-start"
          :label="t`Add a filter`"
          @click="isPickingField = true"
        />
        <FrappeErrorMessage :message="filters.error" />
        <div class="flex gap-2">
          <FrappeButton
            size="lg"
            class="flex-1"
            :label="t`Clear`"
            @click="clear"
          />
          <FrappeButton
            size="lg"
            variant="solid"
            class="flex-1"
            :label="t`Apply`"
            @click="apply"
          />
        </div>
      </div>
    </div>
  </FrappeBottomSheet>
</template>
<script lang="ts">
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
  ErrorMessage as FrappeErrorMessage,
} from 'frappe-ui';
import type { Field } from 'schemas/types';
import Select from 'src/components/Controls/Select.vue';
import FilterValueInput from 'src/components/FilterValueInput.vue';
import { isValuelessCondition } from 'src/utils/filterQuery';
import type { ListFilters } from 'src/utils/listFilters';
import { defineComponent, type PropType } from 'vue';
import MobileFilterFieldList from './MobileFilterFieldList.vue';

/** Edits a phone list's filters; applies them on Apply or on dismiss. */
export default defineComponent({
  name: 'MobileFilterSheet',
  components: {
    FilterValueInput,
    FrappeBottomSheet,
    FrappeButton,
    FrappeErrorMessage,
    MobileFilterFieldList,
    Select,
  },
  props: {
    open: Boolean,
    filters: { type: Object as PropType<ListFilters>, required: true },
  },
  emits: ['update:open', 'apply'],
  data() {
    return { isPickingField: false };
  },
  watch: {
    open(open: boolean) {
      if (open) this.isPickingField = !this.filters.explicitRows.length;
    },
  },
  methods: {
    isValuelessCondition,
    addFilter(field: Field) {
      this.filters.add(field);
      this.isPickingField = false;
    },
    async onOpenChange(open: boolean) {
      if (open) return;
      // A dismiss can run before blur commits a picker's typed value.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      this.emitApply();
      this.$emit('update:open', false);
    },
    apply() {
      if (this.emitApply()) this.$emit('update:open', false);
    },
    clear() {
      this.filters.clear();
      this.apply();
    },
    emitApply(): boolean {
      const filters = this.filters.apply();
      if (filters) this.$emit('apply', filters);
      return filters !== undefined;
    },
  },
});
</script>
