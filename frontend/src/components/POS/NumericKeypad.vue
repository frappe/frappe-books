<template>
	<div class="flex flex-col gap-4">
		<!-- TextInput can't align its text (frappe/frappe-ui#1256). -->
		<FrappeTextInput
			ref="input"
			:model-value="modelValue"
			:aria-label="label"
			:error="displayError"
			:disabled="disabled"
			size="lg"
			variant="outline"
			inputmode="decimal"
			autocomplete="off"
			class="[&_input]:text-end [&_input]:font-medium [&_input]:tabular-nums"
			@focus="selectValue"
			@keydown.enter.prevent="$emit('submit')"
			@keydown.esc.stop.prevent="$emit('cancel')"
			@update:model-value="handleTextInput"
		/>

		<div class="grid grid-cols-4 gap-2" role="group" :aria-label="t`Numeric keypad`">
			<!-- Plain buttons: touch keys need 52px; frappe-ui's largest Button is 40px (frappe/frappe-ui#1250). -->
			<button
				v-for="key in keyDefinitions"
				:key="key.value"
				type="button"
				:aria-label="key.ariaLabel"
				:disabled="disabled"
				class="flex h-13 items-center [@media(max-height:700px)]:h-10 justify-center rounded-4 tabular-nums transition-colors disabled:cursor-not-allowed disabled:text-ink-gray-4"
				:class="[
					key.wide ? 'col-span-2 text-md-medium' : 'text-3xl-medium',
					key.action
						? 'bg-surface-gray-3 text-ink-gray-7 enabled:hover:bg-surface-gray-4'
						: 'bg-surface-gray-2 text-ink-gray-9 enabled:hover:bg-surface-gray-3 enabled:active:bg-surface-gray-4',
				]"
				@mousedown.prevent
				@click="pressKey(key.value)"
			>
				<span v-if="key.icon" :class="key.icon" class="size-5" aria-hidden="true" />
				<template v-else>{{ key.label }}</template>
			</button>
		</div>
	</div>
</template>

<script lang="ts">
import { TextInput as FrappeTextInput } from "frappe-ui";
import { defineComponent, nextTick } from "vue";
import { applyNumericKey, normalizeNumericDraft, NumericKey } from "./numericKeypad";

type KeyDefinition = {
	label: string;
	value: NumericKey;
	ariaLabel: string;
	wide?: boolean;
	/** Edits the value rather than typing a digit. */
	action?: boolean;
	icon?: string;
};

type TextInputRef = {
	focus: (options?: FocusOptions) => void;
	inputElement: HTMLInputElement | null;
};

export default defineComponent({
	name: "NumericKeypad",
	components: { FrappeTextInput },
	props: {
		modelValue: { type: String, required: true },
		label: { type: String, required: true },
		error: { type: String, default: "" },
		disabled: { type: Boolean, default: false },
	},
	emits: ["update:modelValue", "submit", "cancel"],
	data() {
		return {
			replaceOnEntry: true,
			inputError: "",
		};
	},
	computed: {
		displayError(): string {
			return this.error || this.inputError;
		},
		inputElement(): HTMLInputElement | null {
			return (this.$refs.input as TextInputRef | undefined)?.inputElement ?? null;
		},
		keyDefinitions(): KeyDefinition[] {
			return [
				{ label: "7", value: "7", ariaLabel: "7" },
				{ label: "8", value: "8", ariaLabel: "8" },
				{ label: "9", value: "9", ariaLabel: "9" },
				{
					label: this.t`Del`,
					value: "backspace",
					ariaLabel: this.t`Delete last digit`,
					action: true,
					icon: "lucide-delete",
				},
				{ label: "4", value: "4", ariaLabel: "4" },
				{ label: "5", value: "5", ariaLabel: "5" },
				{ label: "6", value: "6", ariaLabel: "6" },
				{
					label: "−",
					value: "-",
					ariaLabel: this.t`Make negative`,
					action: true,
				},
				{ label: "1", value: "1", ariaLabel: "1" },
				{ label: "2", value: "2", ariaLabel: "2" },
				{ label: "3", value: "3", ariaLabel: "3" },
				{
					label: "+",
					value: "+",
					ariaLabel: this.t`Make positive`,
					action: true,
				},
				{ label: ".", value: ".", ariaLabel: this.t`Decimal point` },
				{ label: "0", value: "0", ariaLabel: "0" },
				{
					label: this.t`Clear`,
					value: "clear",
					ariaLabel: this.t`Clear`,
					wide: true,
					action: true,
				},
			];
		},
	},
	methods: {
		async begin() {
			this.replaceOnEntry = true;
			this.inputError = "";
			await nextTick();
			this.focusAndSelect();
		},
		handleTextInput(rawValue: string) {
			const value = normalizeNumericDraft(rawValue);
			if (value === null) {
				this.inputError = this
					.t`Use digits, one decimal point, and an optional leading minus.`;
				this.restoreInputValue();
				return;
			}

			this.inputError = "";
			this.replaceOnEntry = false;
			this.$emit("update:modelValue", value);
		},
		pressKey(key: NumericKey) {
			const draft = applyNumericKey(
				{ value: this.modelValue, replaceOnEntry: this.replaceOnEntry },
				key
			);

			this.inputError = "";
			this.replaceOnEntry = draft.replaceOnEntry;
			this.$emit("update:modelValue", draft.value);
			nextTick(() => this.focusInput());
		},
		selectValue() {
			if (this.replaceOnEntry) {
				this.inputElement?.select();
			}
		},
		focusAndSelect() {
			this.focusInput();
			this.inputElement?.select();
		},
		focusInput() {
			(this.$refs.input as TextInputRef | undefined)?.focus();
		},
		restoreInputValue() {
			nextTick(() => {
				if (this.inputElement) {
					this.inputElement.value = this.modelValue;
				}
			});
		},
	},
});
</script>
