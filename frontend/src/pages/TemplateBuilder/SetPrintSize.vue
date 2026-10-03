<template>
  <FrappeDialog
    :open="open"
    :title="t`Set Print Size`"
    :actions="[{ label: t`Done`, variant: 'solid', onClick: done }]"
    @update:open="(value: boolean) => $emit('update:open', value)"
  >
    <div class="flex w-full flex-col gap-4">
      <p class="text-p-base text-ink-gray-7">
        {{
          t`Select a pre-defined page size, or set a custom page size for your Print Template.`
        }}
      </p>
      <Select
        :df="df"
        :value="size"
        :border="true"
        :show-label="true"
        @change="sizeChange"
      />
      <div class="flex gap-4 w-full">
        <Float
          class="w-full"
          :df="heightField"
          :border="true"
          :show-label="true"
          :value="height"
          @change="(v) => valueChange(v, 'height')"
        />
        <Float
          class="w-full"
          :df="widthField"
          :border="true"
          :show-label="true"
          :value="width"
          @change="(v) => valueChange(v, 'width')"
        />
      </div>
    </div>
  </FrappeDialog>
</template>
<script lang="ts">
import { Dialog as FrappeDialog } from 'frappe-ui';
import { PrintFormat } from 'models/baseModels/PrintFormat';
import { Field, OptionField } from 'schemas/types';
import Float from 'src/components/Controls/Float.vue';
import Select from 'src/components/Controls/Select.vue';
import { getPageSize, setPageSize } from 'src/utils/printFormats';
import { paperSizeMap, printSizes } from 'src/utils/ui';
import { defineComponent } from 'vue';

type SizeName = (typeof printSizes)[number];
export default defineComponent({
  components: { Float, FrappeDialog, Select },
  props: {
    open: { type: Boolean, default: false },
    doc: { type: PrintFormat, required: true },
  },
  emits: ['update:open'],
  data() {
    return { size: 'A4', width: 21, height: 29.7 };
  },
  computed: {
    df(): OptionField {
      return {
        label: 'Page Size',
        fieldname: 'size',
        fieldtype: 'Select',
        options: printSizes.map((value) => ({ value, label: value })),
        default: 'A4',
      };
    },
    heightField(): Field {
      return { fieldname: 'height', label: this.t`Height (in cm)`, fieldtype: 'Float' };
    },
    widthField(): Field {
      return { fieldname: 'width', label: this.t`Width (in cm)`, fieldtype: 'Float' };
    },
  },
  watch: {
    open: {
      handler(open: boolean) {
        if (open) {
          this.setSizeFromDoc();
        }
      },
      immediate: true,
    },
  },
  methods: {
    setSizeFromDoc() {
      const { width, height } = getPageSize(this.doc.css);
      this.width = width;
      this.height = height;

      this.size = '';
      Object.entries(paperSizeMap).forEach(([name, { width, height }]) => {
        if (this.width === width && this.height === height) {
          this.size = name;
        }
      });

      this.size ||= 'Custom';
    },
    sizeChange(v: string) {
      const size = paperSizeMap[v as SizeName];
      if (!size) {
        return;
      }

      this.height = size.height;
      this.width = size.width;
    },
    valueChange(v: number | null, name: 'width' | 'height') {
      // Text that is no number keeps the size.
      if (v === null || this[name] === v) {
        return;
      }

      this.size = 'Custom';
      this[name] = v;
    },
    async done() {
      const size = { width: this.width, height: this.height };
      await this.doc.set('css', setPageSize(this.doc.css, size));
      this.$emit('update:open', false);
    },
  },
});
</script>
