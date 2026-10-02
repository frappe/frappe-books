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
      @update:open="(open) => !open && (searchQuery = '')"
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
    :placeholder="inputPlaceholder"
    :empty-text="emptyMessage"
    :required="isRequired"
    :size="frappeSize"
    :variant="frappeVariant"
    class="min-w-0"
    :class="controlClasses"
    :style="containerStyles"
    @focus="onComboboxFocus"
    @blur="isFocused = false"
    @keydown.enter="onPressEnter"
    @input="onComboboxInput"
    @update:open="onComboboxOpen"
    @update:model-value="onComboboxValueChange"
  >
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

      return Boolean(
        (isLink && this.df.target) ||
        (this.df.references && this.doc?.[this.df.references])
      );
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
    onComboboxOpen(isOpen) {
      this.isDropdownOpen = isOpen;
      if (isOpen) {
        this.updateSuggestions(this.searchQuery);
      } else {
        this.searchQuery = '';
      }
    },
    onComboboxInput(event) {
      if (this.isReadOnly || !(event.target instanceof HTMLInputElement)) {
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
