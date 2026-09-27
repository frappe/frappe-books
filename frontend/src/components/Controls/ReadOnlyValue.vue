<template>
	<div v-if="isMobile" class="flex min-w-0 flex-col gap-1.5" :style="containerStyles">
		<span v-if="showLabel" class="text-sm text-ink-gray-6">{{ df.label }}</span>
		<button
			v-if="linked"
			class="min-h-6 break-words text-start text-lg text-ink-blue-link"
			@click="$emit('open')"
		>
			{{ displayText }}
		</button>
		<span v-else class="min-h-6 break-words text-lg text-ink-gray-8">{{ displayText }}</span>
	</div>
	<FrappeTextInput
		v-else
		:model-value="displayText"
		:label="showLabel ? df.label : undefined"
		:description="showLabel ? df.sub_label : undefined"
		:required="required"
		:size="frappeSize"
		:variant="border ? 'outline' : 'ghost'"
		:class="controlClasses"
		:style="containerStyles"
		:title="displayText"
		disabled
	>
		<template v-if="$slots.trailing" #suffix>
			<!-- TextInput reserves 8/10px for suffixes; 24px actions need 2/4px. -->
			<div class="inline-flex items-center" :class="{ '-me-1.5': trailingActions }">
				<slot name="trailing"></slot>
			</div>
		</template>
	</FrappeTextInput>
</template>

<script lang="ts">
import { Doc } from "fyo/model/doc";
import { TextInput as FrappeTextInput } from "frappe-ui";
import { Field } from "schemas/types";
import { fyo } from "src/initFyo";
import { isNumeric } from "src/utils";
import { isMobile } from "src/utils/viewport";
import { defineComponent, PropType } from "vue";

export default defineComponent({
	name: "ReadOnlyValue",
	components: { FrappeTextInput },
	props: {
		df: { type: Object as PropType<Field>, required: true },
		value: {
			type: [String, Number, Boolean, Object, Array] as PropType<
				string | number | boolean | Record<string, unknown> | unknown[] | null
			>,
			default: null,
		},
		displayValue: String,
		doc: { type: Object as PropType<Doc> },
		border: { type: Boolean, default: false },
		showLabel: { type: Boolean, default: false },
		trailingActions: { type: Boolean, default: false },
		/** Phones show the value as a link that emits `open`. */
		linked: { type: Boolean, default: false },
		required: { type: Boolean, default: false },
		size: { type: String, default: "large" },
		textRight: {
			type: [null, Boolean] as PropType<boolean | null>,
			default: null,
		},
		containerStyles: { type: Object, default: () => ({}) },
	},
	emits: ["open"],
	setup() {
		return { isMobile };
	},
	computed: {
		displayText(): string {
			if (String(this.df.fieldtype) === "Secret") {
				return this.value ? "••••••••" : "—";
			}

			const formatted = this.displayValue ?? this.formatValue(this.value, this.df, this.doc);
			return formatted || "—";
		},
		frappeSize(): "sm" | "md" {
			return this.size === "small" ? "sm" : "md";
		},
		controlClasses(): string[] {
			const classes = ["font-sans", "[&_input]:cursor-not-allowed", "[&_input]:text-base"];
			if (this.textRight ?? isNumeric(this.df)) {
				classes.push("[&_input]:text-end");
			}
			return classes;
		},
	},
	methods: {
		formatValue(value: unknown, field: Field, doc?: Doc): string {
			return fyo.format(value, field, doc);
		},
	},
});
</script>
