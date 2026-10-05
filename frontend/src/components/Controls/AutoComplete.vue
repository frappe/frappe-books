<template>
  <ReadOnlyValue
    v-if="isReadOnly"
    :df="df"
    :value="value"
    :display-value="linkValue || undefined"
    :doc="doc"
    :border="border"
    :show-label="showLabel"
    :required="isRequired"
    :size="size"
    :text-right="textRight"
    :container-styles="containerStyles"
    :trailing-actions="canLink"
    :linked="canLink"
    @open="routeToLinkedDoc"
  >
    <template v-if="canLink" #trailing>
      <LinkedEntryButton
        :schema-name="linkSchemaName"
        :value="String(value ?? '')"
        @open="routeToLinkedDoc"
      />
    </template>
  </ReadOnlyValue>

  <div v-else-if="isMobile" :style="containerStyles">
    <MobileFieldTrigger
      :label="showLabel ? df.label : undefined"
      :required="isRequired"
      :placeholder="inputPlaceholder"
      :display-value="linkValue || String(value ?? '')"
      :invalid="invalid"
      @click="openPicker"
    />
    <MobilePicker
      v-model:open="isDropdownOpen"
      :query="searchQuery"
      :title="df.label"
      :options="suggestions"
      :loading="isLoading"
      :empty-text="emptyMessage"
      @update:query="search"
      @update:open="onPickerOpen"
      @select="onPickerSelect"
    />
  </div>

  <FrappeCombobox
    v-else
    ref="input"
    spellcheck="false"
    :model-value="comboboxValue"
    :options="comboboxOptions"
    :open="isDropdownOpen"
    :loading="isLoading"
    :filterable="false"
    :open-on-focus="true"
    :label="showLabel ? df.label : undefined"
    :aria-label="showLabel ? undefined : df.label"
    :description="showLabel ? df.sub_label : undefined"
    :placeholder="triggerButton ? t`Search` : inputPlaceholder"
    :empty-text="emptyMessage"
    :required="isRequired"
    :size="frappeSize"
    :variant="frappeVariant"
    :trigger="triggerButton ? 'button' : 'input'"
    v-bind="
      triggerButton
        ? { query: searchQuery, 'onUpdate:query': searchOptions }
        : {}
    "
    class="min-w-0"
    :class="controlClasses"
    :style="containerStyles"
    @focus="onComboboxFocus"
    @blur="onComboboxBlur"
    @keydown.enter="onPressEnter"
    @input="onComboboxInput"
    @update:open="onComboboxOpen"
    @update:model-value="onComboboxValueChange"
  >
    <!-- Button mode drops #prefix once a value is set, so the trigger shows the label itself. -->
    <template v-if="triggerButton" #trigger="{ open }">
      <FrappeButton
        variant="outline"
        size="sm"
        class="max-w-80"
        role="combobox"
        aria-haspopup="listbox"
        :aria-label="df.label"
        :aria-expanded="open"
      >
        <span v-if="inlineLabel" class="me-2 text-ink-gray-5">{{
          df.label
        }}</span>
        <span class="truncate">{{ triggerLabel }}</span>
        <template #suffix>
          <span
            class="lucide-chevron-down size-4 text-ink-gray-5 transition-transform duration-200"
            :class="open ? 'rotate-180' : ''"
            aria-hidden="true"
          />
        </template>
      </FrappeButton>
    </template>
    <template v-if="triggerButton && value" #footer="{ clear, close }">
      <FrappeButton
        class="w-full"
        variant="ghost"
        :label="t`Clear`"
        @click="
          clear();
          close();
        "
      />
    </template>
    <template v-if="inlineLabel && !triggerButton" #prefix>
      <span class="shrink-0 text-base text-ink-gray-5">{{ df.label }}</span>
    </template>
    <template #suffix="{ open, clear, setOpen }">
      <!-- Pulled to the end so the buttons' hover backgrounds sit as far from the end edge as from the top and bottom. -->
      <div class="-me-[7px] flex shrink-0 items-center gap-0.5">
        <FrappeButton
          v-if="value && showClearButton"
          variant="ghost"
          size="xs"
          icon="lucide-x"
          :aria-label="t`Clear value`"
          @pointerdown.prevent
          @click.stop="clearSelection(clear, setOpen)"
        />

        <LinkedEntryButton
          v-if="canLink"
          :schema-name="linkSchemaName"
          :value="String(value ?? '')"
          @open="routeToLinkedDoc"
        />

        <FrappeButton
          variant="ghost"
          size="xs"
          :aria-label="open ? t`Close options` : t`Open options`"
          @pointerdown.prevent
          @click.stop="setOpen(!open)"
        >
          <template #icon>
            <span
              class="lucide-chevron-down size-4 transition-transform duration-200"
              :class="open ? 'rotate-180' : ''"
            />
          </template>
        </FrappeButton>
      </div>
    </template>
  </FrappeCombobox>
</template>

<script>
import { getOptionList } from 'fyo/utils';
import { Button as FrappeButton, Combobox as FrappeCombobox } from 'frappe-ui';
import { FieldTypeEnum } from 'schemas/types';
import { fuzzyMatch } from 'src/utils';
import { getModel, getSchema, toSchemaName } from 'src/frappe/registry';
import { fyo } from 'src/initFyo';
import { h } from 'vue';
import MobileFieldTrigger from 'src/mobile/MobileFieldTrigger.vue';
import MobilePicker from 'src/mobile/MobilePicker.vue';
import Base from './Base.vue';
import LinkedEntryButton from './LinkedEntryButton.vue';
import ReadOnlyValue from './ReadOnlyValue.vue';

export default {
  name: 'AutoComplete',
  components: {
    FrappeButton,
    FrappeCombobox,
    LinkedEntryButton,
    MobileFieldTrigger,
    MobilePicker,
    ReadOnlyValue,
  },
  extends: Base,
  emits: ['focus', 'enter', 'search'],
  props: {
    closeOnEnter: { type: Boolean, default: false },
    showClearButton: { type: Boolean, default: false },
    /** Opens from a button showing the value, with the search inside the dropdown. */
    triggerButton: { type: Boolean, default: false },
  },
  data() {
    return {
      isDropdownOpen: false,
      isFocused: false,
      isLoading: false,
      linkValue: '',
      suggestionRequest: 0,
      searchQuery: '',
      suggestions: [],
    };
  },
  computed: {
    triggerLabel() {
      return (
        this.linkValue || String(this.value || '') || this.inputPlaceholder
      );
    },
    comboboxValue() {
      if (typeof this.value === 'string' || typeof this.value === 'number') {
        return this.value || null;
      }
      return this.value == null ? null : String(this.value);
    },
    comboboxOptions() {
      const suggestions = [...this.suggestions];
      const selected = this.findSuggestion(this.value, suggestions);
      const displayField = getSchema(this.linkSchemaName)?.linkDisplayField;
      if (selected && displayField && this.linkValue) {
        // Loading options must not replace the selected record's display label.
        suggestions[suggestions.indexOf(selected)] = {
          ...selected,
          label: this.linkValue,
        };
      }
      if (this.value && !selected) {
        suggestions.unshift({
          label: this.linkValue || String(this.value),
          value: this.value,
        });
      }
      return this.groupComboboxOptions(suggestions);
    },
    emptyMessage() {
      const { schemaName, fieldname } = this.df ?? {};
      const getMessage = getModel(schemaName)?.emptyMessages?.[fieldname];
      return getMessage?.(this.doc) ?? this.t`No results found`;
    },
    linkSchemaName() {
      let schemaName = this.df?.target;
      if (!schemaName) {
        const references = this.df?.references ?? '';
        const reference = this.doc?.[references];
        schemaName = reference && (toSchemaName(reference) ?? reference);
      }
      return schemaName && toSchemaName(schemaName);
    },
    options() {
      return this.df ? getOptionList(this.df, this.doc) : [];
    },
    canLink() {
      if (!this.value || !this.df) {
        return false;
      }

      const isLink = this.df.fieldtype === FieldTypeEnum.Link;
      const isDynamicLink = this.df.fieldtype === FieldTypeEnum.DynamicLink;
      if (!isLink && !isDynamicLink) {
        return false;
      }

      const hasTarget = Boolean(
        (isLink && this.df.target) ||
        (this.df.references && this.doc?.[this.df.references])
      );
      // Only entries the user may read open.
      return hasTarget && fyo.can(this.linkSchemaName, 'read');
    },
  },
  watch: {
    value: {
      immediate: true,
      handler(newValue) {
        const displayValue = this.getLinkValue(newValue);
        this.setLinkValue(displayValue);
      },
    },
  },
  mounted() {
    const value = this.linkValue || this.value;
    this.setLinkValue(this.getLinkValue(value));
  },
  methods: {
    async focusInputTag() {
      await this.$nextTick();
      this.$refs.input?.focus?.();
    },
    setLinkValue(value) {
      this.linkValue = value ?? '';
    },
    getLinkValue(value) {
      const option =
        this.options.find((candidate) => candidate.value === value) ??
        this.options.find((candidate) => candidate.label === value);
      if (!value && !option) {
        return '';
      }
      return option?.label || String(value);
    },
    async updateSuggestions(keyword = '') {
      const request = ++this.suggestionRequest;
      this.isLoading = true;
      try {
        const suggestions = await this.getSuggestions(keyword);
        if (request === this.suggestionRequest) {
          this.suggestions = suggestions;
        }
      } finally {
        if (request === this.suggestionRequest) {
          this.isLoading = false;
        }
      }
    },
    async getSuggestions(keyword = '') {
      const normalizedKeyword = keyword.toLowerCase();
      if (!normalizedKeyword) {
        return this.options;
      }

      return this.options
        .map((item) => ({ ...fuzzyMatch(normalizedKeyword, item.label), item }))
        .filter(({ isMatch }) => isMatch)
        .sort((left, right) => left.distance - right.distance)
        .map(({ item }) => item);
    },
    groupComboboxOptions(suggestions) {
      const ungrouped = [];
      const grouped = new Map();
      suggestions.forEach((suggestion, index) => {
        const option = this.toComboboxOption(suggestion, index);
        const group = suggestion.group ?? '';
        if (!group) {
          ungrouped.push(option);
          return;
        }

        if (!grouped.has(group)) {
          grouped.set(group, []);
        }
        grouped.get(group).push(option);
      });

      const groups = [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([group, options]) => ({ group, options }));
      return [...ungrouped, ...groups];
    },
    toComboboxOption(suggestion, index) {
      if (suggestion.actionOnly) {
        const component = suggestion.component;
        return {
          type: 'custom',
          key: `${this.df.fieldname}-action-${index}`,
          label: suggestion.label ?? this.t`Action`,
          description: suggestion.description,
          onClick: () => this.runSuggestionAction(suggestion),
          slots: component ? { label: () => h(component) } : undefined,
        };
      }

      return {
        ...suggestion,
        type: 'option',
        label: suggestion.label,
        value: this.getSuggestionValue(suggestion),
      };
    },
    getSuggestionValue(suggestion) {
      return suggestion.value ?? suggestion.label;
    },
    findSuggestion(value, suggestions = this.suggestions) {
      return suggestions.find(
        (suggestion) =>
          !suggestion.actionOnly &&
          this.getSuggestionValue(suggestion) === value
      );
    },
    async runSuggestionAction(suggestion) {
      if (!suggestion.action) {
        return;
      }

      if (this.doc) {
        await suggestion.action(this.doc, this.$router);
        return;
      }
      await suggestion.action();
    },
    setSuggestion(suggestion) {
      if (!suggestion || suggestion.actionOnly) {
        return;
      }

      this.searchQuery = '';
      this.linkValue = suggestion.label;
      this.triggerChange(this.getSuggestionValue(suggestion));
    },
    clearSelection(clear, setOpen) {
      this.searchQuery = '';
      clear();
      this.linkValue = '';
      this.updateSuggestions();
      setOpen(true);
    },
    onComboboxFocus(event) {
      this.isFocused = true;
      this.$emit('focus', event);
    },
    onComboboxBlur() {
      this.isFocused = false;
      this.clearUnlistedValue();
    },
    onPickerOpen(isOpen) {
      if (!isOpen) {
        this.searchQuery = '';
        this.clearUnlistedValue();
      }
    },
    /** Frappe desk's Autocomplete takes a typed label as its value and drops one not listed. */
    clearUnlistedValue() {
      const isCustom =
        this.df.fieldtype !== FieldTypeEnum.AutoComplete || this.df.allowCustom;
      if (isCustom || !this.value || !this.options.length) {
        return;
      }

      if (this.options.some(({ value }) => value === this.value)) {
        return;
      }

      const option = this.options.find(({ label }) => label === this.value);
      this.triggerChange(option?.value ?? '');
    },
    onComboboxOpen(isOpen) {
      this.isDropdownOpen = isOpen;
      // Button mode's search box starts empty on every open.
      if (!isOpen || this.triggerButton) {
        this.searchQuery = '';
      }
      if (isOpen) {
        this.updateSuggestions(this.searchQuery);
      }
    },
    /** Button mode's search only narrows the options; picking one sets the value. */
    searchOptions(query) {
      this.searchQuery = query;
      this.updateSuggestions(query);
    },
    onComboboxInput(event) {
      // Button mode's search box only narrows the options (searchOptions).
      if (
        this.isReadOnly ||
        this.triggerButton ||
        !(event.target instanceof HTMLInputElement)
      ) {
        return;
      }

      this.search(event.target.value);
    },
    search(value) {
      this.searchQuery = value;
      this.$emit('search', value);
      // Link searches keep the stored ID until an option is selected.
      if (this.df.fieldtype === FieldTypeEnum.AutoComplete) {
        this.triggerChange(value);
      }
      this.updateSuggestions(value);
    },
    onComboboxValueChange(value) {
      if (value == null) {
        this.linkValue = '';
        this.triggerChange('');
        return;
      }

      const suggestion = this.findSuggestion(value);
      if (suggestion) {
        this.setSuggestion(suggestion);
        return;
      }

      this.linkValue = String(value);
      this.triggerChange(value);
    },
    openPicker() {
      this.isDropdownOpen = true;
      this.updateSuggestions(this.searchQuery);
    },
    async onPickerSelect(suggestion) {
      if (suggestion.actionOnly) {
        await this.runSuggestionAction(suggestion);
        return;
      }

      this.isDropdownOpen = false;
      this.setSuggestion(suggestion);
    },
    async onPressEnter(event) {
      await this.$nextTick();
      const enteredValue =
        this.searchQuery || event.target?.value || this.value;
      this.$emit('enter', enteredValue);
      if (this.closeOnEnter) {
        this.isDropdownOpen = false;
      }
    },
    async routeToLinkedDoc() {
      if (!this.linkSchemaName || !this.value) {
        return;
      }
      // Imported on use: src/utils/ui imports the router, whose pages import this control.
      const { getFormRoute, routeTo } = await import('src/utils/ui');
      await routeTo(getFormRoute(this.linkSchemaName, this.value));
    },
  },
};
</script>
