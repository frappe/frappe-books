<template>
  <div class="overflow-hidden" :style="outerContainerStyle">
    <!-- Server-rendered print documents run no scripts. -->
    <iframe
      ref="frame"
      class="block border-0"
      :title="t`Print preview`"
      :srcdoc="document ?? previewDocument"
      :sandbox="document ? 'allow-same-origin allow-modals' : undefined"
      :style="innerContainerStyle"
      @load="onLoad"
    />
    <Teleport v-if="frameBody && !document" :to="frameBody">
      <div class="h-full w-full">
        <slot />
      </div>
    </Teleport>
  </div>
</template>

<script lang="ts">
import { constructPrintDocument } from 'src/utils/printDocument';
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    height: { type: Number, default: 29.7 },
    width: { type: Number, default: 21 },
    scale: { type: Number, default: 0.65 },
    /** A complete print document to show instead of the slot. */
    document: { type: String, default: undefined },
  },
  data() {
    return { frameBody: null as HTMLElement | null };
  },
  computed: {
    previewDocument(): string {
      // Use the printed document's styles, isolated from the app's theme.
      return constructPrintDocument(
        this.t`Print preview`,
        '',
        this.width,
        this.height
      );
    },
    innerContainerStyle(): Record<string, string> {
      return {
        width: `${this.width}cm`,
        height: `${this.height}cm`,
        transform: `scale(${this.scale})`,
        transformOrigin: 'top left',
      };
    },
    outerContainerStyle(): Record<string, string> {
      // Transforms do not change layout dimensions.
      return {
        height: `calc(${this.scale} * ${this.height}cm)`,
        width: `calc(${this.scale} * ${this.width}cm)`,
      };
    },
  },
  methods: {
    onLoad(event: Event) {
      const frame = event.target as HTMLIFrameElement;
      this.frameBody = frame.contentDocument?.body ?? null;
    },
    getHTML(): string | undefined {
      return this.frameBody?.innerHTML;
    },
    print() {
      (this.$refs.frame as HTMLIFrameElement).contentWindow?.print();
    },
  },
});
</script>
