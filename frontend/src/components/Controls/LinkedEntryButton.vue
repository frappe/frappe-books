<template>
	<FrappeHoverCard
		v-model:open="previewOpen"
		side="bottom"
		align="center"
		:offset="8"
		:hover-delay="300"
		:leave-delay="150"
	>
		<template #trigger>
			<!-- Preview visibility belongs to the hover target, not the button's pressed state. -->
			<span
				class="inline-flex shrink-0"
				@focusin="previewOpen = true"
				@focusout="previewOpen = false"
			>
				<FrappeButton
					variant="ghost"
					size="xs"
					icon="lucide-chevron-right"
					:label="t`Open linked entry`"
					@pointerdown.prevent
					@click.stop="open"
				/>
			</span>
		</template>
		<QuickView :schema-name="schemaName" :name="value" />
	</FrappeHoverCard>
</template>

<script lang="ts">
import { Button as FrappeButton, HoverCard as FrappeHoverCard } from "frappe-ui";
import { defineComponent } from "vue";
import QuickView from "../QuickView.vue";

export default defineComponent({
	name: "LinkedEntryButton",
	components: { FrappeButton, FrappeHoverCard, QuickView },
	props: {
		schemaName: { type: String, default: "" },
		value: { type: String, default: "" },
	},
	emits: ["open"],
	data() {
		return { previewOpen: false };
	},
	methods: {
		/** The form stays alive behind the opened entry; an open preview would stay on screen. */
		open() {
			this.previewOpen = false;
			this.$emit("open");
		},
	},
});
</script>
