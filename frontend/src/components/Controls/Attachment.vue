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
  type UploadedFile,
} from 'frappe-ui';
import { Field } from 'schemas/types';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getFileName, isFileUrl } from 'src/utils/files';
import { defineComponent, PropType } from 'vue';
import Base from './Base.vue';
import ReadOnlyValue from './ReadOnlyValue.vue';

export default defineComponent({
  components: { FrappeFileUploader, FrappeButton, ReadOnlyValue },
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
