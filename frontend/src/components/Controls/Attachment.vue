<template>
  <div v-if="isMobile" class="min-w-0 space-y-1.5">
    <FrappeFormLabel
      v-if="showLabel"
      :label="df?.label ?? ''"
      :required="isRequired"
    />
    <div
      v-if="value"
      class="flex min-h-13 items-center gap-2.5 rounded-5 border border-outline-gray-2 pe-1 ps-3"
    >
      <span class="lucide-file-text size-5 shrink-0 text-ink-gray-6" aria-hidden="true" />
      <button
        class="flex min-w-0 flex-1 flex-col gap-0.5 py-2 text-start"
        @click="download"
      >
        <span class="truncate text-md-medium text-ink-gray-8">{{ label }}</span>
        <span class="text-sm uppercase text-ink-gray-5">{{ extension }}</span>
      </button>
      <FrappeButton
        v-if="!isReadOnly"
        variant="ghost"
        icon="lucide-x"
        :label="t`Remove attachment`"
        @click="clear"
      />
    </div>
    <FrappeFileUploader
      v-else-if="!isReadOnly"
      file-types="image/*,.pdf"
      @success="onUploaded"
      @failure="onUploadFailure"
    >
      <template #default="{ openFileSelector, uploading }">
        <button
          class="flex h-11 w-full items-center justify-center gap-2 rounded-5 border border-dashed text-md-medium text-ink-gray-7"
          :class="invalid ? 'border-outline-red-3' : 'border-outline-gray-3'"
          :disabled="uploading"
          @click="openFileSelector"
        >
          <span class="lucide-paperclip size-4" aria-hidden="true" />
          {{ uploading ? t`Uploading...` : t`Attach file` }}
        </button>
      </template>
    </FrappeFileUploader>
    <p v-else class="text-lg text-ink-gray-8">—</p>
  </div>
  <div v-else class="min-w-0">
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
          <FrappeFileUploader
            v-if="!value && !isReadOnly"
            file-types="image/*,.pdf"
            @success="onUploaded"
            @failure="onUploadFailure"
          >
            <template #default="{ openFileSelector, uploading }">
              <FrappeButton
                variant="ghost"
                size="xs"
                icon="lucide-upload"
                aria-label="Upload attachment"
                :loading="uploading"
                @click="openFileSelector"
              />
            </template>
          </FrappeFileUploader>

          <FrappeButton
            v-if="value"
            variant="ghost"
            size="xs"
            icon="lucide-download"
            aria-label="Download attachment"
            @click="download"
          />

          <FrappeButton
            v-if="value && !isReadOnly"
            variant="ghost"
            size="xs"
            icon="lucide-x"
            aria-label="Remove attachment"
            @click="clear"
          />
        </div>
      </template>
    </ReadOnlyValue>
  </div>
</template>
<script lang="ts">
import { t } from 'fyo';
import {
  Button as FrappeButton,
  FileUploader as FrappeFileUploader,
  FormLabel as FrappeFormLabel,
  type UploadedFile,
} from 'frappe-ui';
import { Field } from 'schemas/types';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getFileName, isFileUrl } from 'src/utils/files';
import { defineComponent, PropType } from 'vue';
import Base from './Base.vue';
import ReadOnlyValue from './ReadOnlyValue.vue';

export default defineComponent({
  components: {
    FrappeFileUploader,
    FrappeButton,
    FrappeFormLabel,
    ReadOnlyValue,
  },
  extends: Base,
  props: {
    df: Object as PropType<Field>,
    value: { type: String as PropType<string | null>, default: null },
    border: { type: Boolean, default: false },
    size: String,
  },
  computed: {
    extension(): string {
      return getFileName(this.value ?? '').split('.').at(-1) ?? '';
    },
    label() {
      if (this.value) {
        return getFileName(this.value);
      }

      return this.df?.placeholder ?? this.df?.label ?? t`Attachment`;
    },
  },
  methods: {
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
    onUploaded(file: UploadedFile) {
      this.triggerChange(file.file_url);
    },
    async onUploadFailure(error: unknown) {
      await handleErrorWithDialog(error, this.doc, true);
    },
  },
});
</script>
