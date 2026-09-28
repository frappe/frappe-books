<script>
import { t } from 'fyo';
import { getAccountLabel } from 'src/utils/accountLabel';
import { fyo } from 'src/initFyo';
import { LINK_PAGE_LENGTH, sortByFuzzyMatch } from 'src/utils';
import { linkOnSave } from 'src/utils/doc';
import { getCreateFiltersFromListViewFilters } from 'src/utils/misc';
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
      const { fieldname } = this.df ?? {};
      const target = this.getTargetSchemaName();
      const linkDisplayField = fyo.schemaMap[target ?? '']?.linkDisplayField;
      if (!linkDisplayField) {
        return (this.linkValue = target === 'Account' ? getAccountLabel(fyo, value || '') : value);
      }

      const linkDoc = await this.doc?.loadAndGetLink(fieldname);
      this.linkValue = linkDoc?.get(linkDisplayField) ?? '';
    },
    getTargetSchemaName() {
      return this.df.target;
    },
    async getOptions(keyword, filters) {
      const schemaName = this.getTargetSchemaName();
      if (!schemaName) {
        return [];
      }

      const schema = fyo.schemaMap[schemaName];
      const fields = [
        ...new Set(['name', schema.titleField, this.df.groupBy]),
      ].filter(Boolean);
      const rows = await fyo.db.searchLink(
        schemaName,
        keyword,
        filters,
        fields,
        LINK_PAGE_LENGTH
      );

      return rows.map((r) => {
        const label = r[schema.titleField] || r.name;
        const option = {
          label: schemaName === 'Account' ? getAccountLabel(fyo, label) : label,
          value: r.name,
        };
        if (this.df.groupBy) {
          option.group = r[this.df.groupBy];
        }
        return option;
      });
    },
    async getSuggestions(keyword = '') {
      const filters = this.filtersDisabled ? null : await this.getFilters();
      let options = await this.getOptions(keyword, filters);
      options = sortByFuzzyMatch(keyword, options, (item) => [item.label]);

      if (options.length === 0 && !this.df.emptyMessage) {
        if (filters && !!fyo.singles.SystemSettings?.allowFilterBypass) {
          options = [
            {
              label: t`Show unfiltered results`,
              description: t`No results match the current filters`,
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
        this.searchQuery || fyo.doc.getTemporaryName(fyo.schemaMap[schemaName]);
      const filters = await this.getCreateFilters();
      const { openQuickEdit } = await import('src/utils/ui');

      const doc = fyo.doc.getNewDoc(schemaName, { name, ...filters });
      openQuickEdit({ doc });

      linkOnSave(doc, this.doc, this.df.fieldname, (savedName) => {
        this.$router.back();
        this.triggerChange(savedName);
      });
    },
    async getCreateFilters() {
      const { schemaName, fieldname } = this.df;
      const getCreateFilters =
        fyo.models[schemaName]?.createFilters?.[fieldname];
      let createFilters = await getCreateFilters?.(this.doc);

      if (createFilters !== undefined) {
        return createFilters;
      }

      const filters = (await this.getFilters()) ?? {};
      return getCreateFiltersFromListViewFilters(filters);
    },
    async getFilters() {
      if (this.df.filters) {
        return this.df.filters;
      }

      if (fyo.singles.SystemSettings?.removeFilter) {
        return null;
      }

      const { schemaName, fieldname } = this.df;
      const getFilters = fyo.models[schemaName]?.filters?.[fieldname];

      if (getFilters === undefined) {
        return null;
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
