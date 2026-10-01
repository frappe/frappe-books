<script>
import { t } from 'fyo';
import { getLinkDisplayValue, searchFrappeLink } from 'src/frappe/link';
import { getModel, getSchema } from 'src/frappe/registry';
import { newFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import { LINK_PAGE_LENGTH, sortByFuzzyMatch } from 'src/utils';
import { linkOnSave } from 'src/utils/doc';
import { getNewDocValues } from 'src/utils/misc';
import AutoComplete from './AutoComplete.vue';

export default {
  name: 'Link',
  extends: AutoComplete,
  data() {
    return { filtersDisabled: false };
  },
  watch: {
    value: {
      immediate: true,
      handler(newValue) {
        this.setLinkValue(newValue);
      },
    },
  },
  mounted() {
    if (this.value) {
      this.setLinkValue();
    }
  },
  props: {
    focusInput: Boolean,
    showClearButton: Boolean,
  },
  async created() {
    if (this.focusInput) {
      this.focusInputTag();
    }
  },
  methods: {
    async setLinkValue(newValue) {
      const value = newValue ?? this.value;
      this.linkValue = await getLinkDisplayValue(
        this.getTargetSchemaName(),
        value
      );
    },
    getTargetSchemaName() {
      return this.df.target;
    },
    async getOptions(keyword, filters) {
      const { groupBy } = this.df;
      const options = await this.searchOptions(
        keyword,
        filters,
        groupBy ? [groupBy] : []
      );
      return options.map(({ record, ...option }) =>
        groupBy ? { ...option, group: record[groupBy] } : option
      );
    },
    /** Options from Frappe's link search, each with its record's `fields`. */
    async searchOptions(keyword, filters, fields) {
      const schemaName = this.getTargetSchemaName();
      if (!schemaName) {
        return [];
      }

      return await searchFrappeLink(
        schemaName,
        keyword,
        filters,
        LINK_PAGE_LENGTH,
        fields
      );
    },
    async getSuggestions(keyword = '') {
      const filters = this.filtersDisabled ? null : await this.getFilters();
      let options = await this.getOptions(keyword, filters);
      options = sortByFuzzyMatch(keyword, options, (item) => [item.label]);

      if (options.length === 0 && !this.df.emptyMessage) {
        if (filters && !!fyo.singles.SystemSettings?.allow_filter_bypass) {
          options = [
            {
              label: t`Show unfiltered results`,
              description: t`No results match the current filters`,
              icon: 'lucide-filter-x',
              action: () => this.disableFiltering(),
              actionOnly: true,
            },
          ];
        }
      }

      if (this.doc && this.df.create && this.canCreateTarget()) {
        options = options.concat(this.getCreateNewOption());
      }

      return options;
    },
    canCreateTarget() {
      const target = this.getTargetSchemaName();
      return !!target && fyo.can(target, 'create');
    },
    getCreateNewOption() {
      return {
        label: t`Create`,
        description: this.searchQuery || undefined,
        icon: 'lucide-plus',
        action: () => this.openNewDoc(),
        actionOnly: true,
      };
    },
    disableFiltering(keyword) {
      this.filtersDisabled = true;
      setTimeout(() => {
        this.isDropdownOpen = true;
        this.updateSuggestions(keyword);
      }, 1);
    },
    async openNewDoc() {
      const schemaName = this.getTargetSchemaName();
      if (!schemaName) {
        return;
      }

      const name =
        this.searchQuery || fyo.getTemporaryName(getSchema(schemaName));
      const values = await this.getCreateValues(schemaName);
      const { openQuickEdit } = await import('src/utils/ui');

      const doc = newFrappeDoc(schemaName, { name, ...values });
      openQuickEdit({ doc });

      linkOnSave(doc, this.doc, this.df.fieldname, (savedName) => {
        this.$router.back();
        // Closes the phone picker the record was created from.
        this.isDropdownOpen = false;
        this.triggerChange(savedName);
      });
    },
    /** Values a record created from the link takes from its create filters, else its filters. */
    async getCreateValues(target) {
      const { schemaName, fieldname } = this.df;
      const getCreateFilters = getModel(schemaName)?.createFilters?.[fieldname];
      const filters = getCreateFilters
        ? await getCreateFilters(this.doc)
        : await this.getFilters();
      return getNewDocValues(target, filters ?? []);
    },
    async getFilters() {
      if (this.df.filters) {
        return this.df.filters;
      }

      if (fyo.singles.SystemSettings?.remove_filter) {
        return null;
      }

      const { schemaName, fieldname } = this.df;
      const getFilters = getModel(schemaName)?.filters?.[fieldname];

      if (getFilters === undefined) {
        return this.df.linkFilters ?? null;
      }

      if (this.doc) {
        return await getFilters(this.doc);
      }

      // Filters that read the document cannot apply without one.
      return getFilters.length ? null : await getFilters();
    },
  },
};
</script>
