<template>
  <div class="min-w-0">
    <ReadOnlyValue
      :df="df"
      :value="value"
      :display-value="value ? label : undefined"
      :doc="doc"
      :border="border"
      :show-label="showLabel"
      :required="isRequired"
      :size="size"
      trailing-actions
    >
      <template v-if="value || !isReadOnly" #trailing>
        <div class="ms-2 flex shrink-0 gap-1">
          <FrappeButton
            v-if="!value && !isReadOnly"
            variant="ghost"
            size="xs"
            aria-label="Upload attachment"
            @click="upload"
          >
            <template #icon><span class="lucide-upload size-4" /></template>
          </FrappeButton>

          <FrappeButton
            v-if="value"
            variant="ghost"
            size="xs"
            aria-label="Download attachment"
            @click="download"
          >
            <template #icon><span class="lucide-download size-4" /></template>
          </FrappeButton>

          <FrappeButton
            v-if="value && !isReadOnly"
            variant="ghost"
            size="xs"
            aria-label="Remove attachment"
            @click="clear"
          >
            <template #icon><span class="lucide-x size-4" /></template>
          </FrappeButton>
        </div>
      </template>
    </ReadOnlyValue>
    <input
      id="attachment"
      ref="fileInput"
      type="file"
      accept="image/*,.pdf"
      class="hidden"
      :disabled="!!value || isReadOnly"
      @input="selectFile"
    />
  </div>
</template>
<script lang="ts">
import { t } from 'fyo';
import { Button as FrappeButton } from 'frappe-ui';
import { Field } from 'schemas/types';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getFileName, isFileUrl } from 'src/utils/files';
import { uploadFile } from 'src/web/api';
import { defineComponent, PropType } from 'vue';
import Base from './Base.vue';
import ReadOnlyValue from './ReadOnlyValue.vue';

export default defineComponent({
  components: { FrappeButton, ReadOnlyValue },
  extends: Base,
  props: {
    df: Object as PropType<Field>,
    value: { type: String as PropType<string | null>, default: null },
    border: { type: Boolean, default: false },
    size: String,
  },
  computed: {
    label() {
      if (this.value) {
        return getFileName(this.value);
      }

      return this.df?.placeholder ?? this.df?.label ?? t`Attachment`;
    },
  },
  methods: {
    upload() {
      (this.$refs.fileInput as HTMLInputElement).click();
    },
    clear() {
      this.triggerChange(null);
    },
    download() {
      if (!isFileUrl(this.value)) {
        return;
      }

      const a = document.createElement('a');

      a.style.display = 'none';
      a.href = this.value;
      a.target = '_self';
      a.download = getFileName(this.value);

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    async selectFile(e: Event) {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      // Lets the same file be picked again, like after a failed upload.
      target.value = '';
      if (!file) {
        return;
      }

      try {
        this.triggerChange(await uploadFile(file));
      } catch (error) {
        await handleErrorWithDialog(error, this.doc, true);
      }
    },
  },
});
</script>
