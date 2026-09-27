<template>
  <div
    class="relative bg-surface-base border border-outline-gray-1 flex-center overflow-hidden group"
    :class="{
      'rounded-2': size === 'form',
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
        class="flex h-full items-center justify-center text-ink-gray-4 font-semibold w-full text-4xl select-none"
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
      class="flex w-full h-full absolute justify-center items-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      style="background: rgba(0, 0, 0, 0.2); backdrop-filter: blur(2px)"
    >
      <FrappeButton
        size="xs"
        variant="subtle"
        class="mb-1"
        :aria-label="shouldClear ? t`Remove image` : t`Upload image`"
        @click="handleClick"
      >
        <template #icon>
          <span
            :class="shouldClear ? 'lucide-x' : 'lucide-upload'"
            class="size-4"
          />
        </template>
      </FrappeButton>
    </div>
  </div>
</template>
<script lang="ts">
import { Field } from 'schemas/types';
import { Button as FrappeButton } from 'frappe-ui';
import { fyo } from 'src/initFyo';
import { pickFile } from 'src/utils/browser';
import { uploadFile } from 'src/web/api';
import { defineComponent, PropType } from 'vue';
import Base from './Base.vue';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'svg'];

export default defineComponent({
  name: 'AttachImage',
  components: { FrappeButton },
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
    shouldClear() {
      return !!this.value;
    },
  },
  methods: {
    async handleClick() {
      if (this.value) {
        return await this.clearImage();
      }
      return await this.selectImage();
    },
    async clearImage() {
      this.triggerChange(null);
    },
    async selectImage() {
      if (this.isReadOnly) {
        return;
      }
      const file = await pickFile({
        title: fyo.t`Select Image`,
        filters: [{ name: 'Image', extensions: IMAGE_EXTENSIONS }],
      });
      if (!file) {
        return;
      }

      this.triggerChange(await uploadFile(file));
    },
  },
});
</script>
