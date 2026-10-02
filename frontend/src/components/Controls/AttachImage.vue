<template>
  <div v-if="isMobile && size !== 'small'" class="min-w-0 space-y-1.5">
    <FrappeFormLabel v-if="showLabel" :label="df?.label ?? ''" />
    <div
      v-if="value"
      class="relative h-24 overflow-hidden rounded-5 border border-outline-gray-2"
    >
      <img :src="value" :alt="df?.label ?? ''" class="h-full w-full object-contain" />
      <FrappeButton
        v-if="!isReadOnly"
        class="absolute end-1 top-1"
        variant="subtle"
        icon="lucide-x"
        :label="t`Remove image`"
        @click="triggerChange(null)"
      />
    </div>
    <FrappeFileUploader
      v-else-if="!isReadOnly"
      file-types="image/*"
      @success="onUploaded"
      @failure="onUploadFailure"
    >
      <template #default="{ openFileSelector, uploading }">
        <button
          class="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-5 border border-dashed border-outline-gray-3 text-base text-ink-gray-5"
          :disabled="uploading"
          @click="openFileSelector"
        >
          <span class="lucide-image-plus size-6" aria-hidden="true" />
          {{ uploading ? t`Uploading...` : t`Upload` }}
        </button>
      </template>
    </FrappeFileUploader>
  </div>
  <div
    v-else
    class="relative bg-surface-base border border-outline-gray-1 flex-center overflow-hidden group"
    :class="{
      'rounded-4': size === 'form',
      'w-20 h-20 rounded-full': size !== 'small' && size !== 'form',
      'w-12 h-12 rounded-full': size === 'small',
    }"
    :title="df?.label"
    :style="imageSizeStyle"
  >
    <img
      v-if="value"
      :src="value"
      :alt="df?.label ?? ''"
      class="h-full w-full object-contain"
    />
    <div v-else :class="[!isReadOnly ? 'group-hover:opacity-90' : '']">
      <div
        v-if="letterPlaceholder"
        class="flex h-full w-full select-none items-center justify-center text-4xl-semibold text-ink-gray-4"
      >
        {{ letterPlaceholder }}
      </div>
      <span
        v-else
        class="lucide-image size-6 text-ink-gray-4"
        aria-hidden="true"
      />
    </div>
    <div
      v-if="!isReadOnly"
      class="flex w-full h-full absolute justify-center items-end bg-black-overlay-200 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-black-overlay-700"
    >
      <FrappeButton
        v-if="value"
        size="xs"
        variant="subtle"
        icon="lucide-x"
        class="mb-1"
        :aria-label="t`Remove image`"
        @click="triggerChange(null)"
      />
      <FrappeFileUploader
        v-else
        class="mb-1"
        file-types="image/*"
        @success="onUploaded"
        @failure="onUploadFailure"
      >
        <template #default="{ openFileSelector, uploading }">
          <FrappeButton
            size="xs"
            variant="subtle"
            icon="lucide-upload"
            :aria-label="t`Upload image`"
            :loading="uploading"
            @click="openFileSelector"
          />
        </template>
      </FrappeFileUploader>
    </div>
  </div>
</template>
<script lang="ts">
import { Field } from 'schemas/types';
import {
  Button as FrappeButton,
  FileUploader as FrappeFileUploader,
  FormLabel as FrappeFormLabel,
  type UploadedFile,
} from 'frappe-ui';
import { handleErrorWithDialog } from 'src/errorHandling';
import { defineComponent, PropType } from 'vue';
import Base from './Base.vue';

export default defineComponent({
  name: 'AttachImage',
  components: { FrappeFileUploader, FrappeButton, FrappeFormLabel },
  extends: Base,
  props: {
    letterPlaceholder: { type: String, default: '' },
    value: { type: String, default: '' },
    df: { type: Object as PropType<Field> },
  },
  computed: {
    imageSizeStyle() {
      if (this.size === 'form') {
        return { width: '135px', height: '135px' };
      }
      return {};
    },
  },
  methods: {
    onUploaded(file: UploadedFile) {
      this.triggerChange(file.file_url);
    },
    async onUploadFailure(error: unknown) {
      await handleErrorWithDialog(error, this.doc, true);
    },
  },
});
</script>
