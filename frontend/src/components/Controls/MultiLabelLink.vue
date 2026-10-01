<script>
import { t } from 'fyo';
import { getLinkDisplayValue } from 'src/frappe/link';
import { fyo } from 'src/initFyo';
import { LINK_PAGE_LENGTH, sortByFuzzyMatch } from 'src/utils';
import { linkOnSave } from 'src/utils/doc';
import { getCreateFiltersFromListViewFilters } from 'src/utils/misc';
import AutoComplete from './AutoComplete.vue';

export default {
  name: 'MultiLabelLink',
  extends: AutoComplete,
  watch: {
    value: {
      immediate: true,
      handler(newValue) {
        this.setLinkValue(newValue);
      },
    },
  },
  props: {
    optionRecords: {
      type: Array,
      default: null,
    },
    thirdLink: String,
    showSecondaryLink: {
      type: Boolean,
      default: false,
    },
    secondaryLink: String,
    showClearButton: {
      type: Boolean,
      default: false,
    },
  },
  mounted() {
    if (this.value) {
      this.setLinkValue();
    }
  },
  methods: {
    async setLinkValue(newValue) {
      const value = newValue ?? this.value;
      this.linkValue = await getLinkDisplayValue(this.df?.target, value);
    },
    getTargetSchemaName() {
      return this.df.target;
    },
    async getOptions(keyword) {
      const schemaName = this.getTargetSchemaName();

      if (!schemaName) {
        return [];
      }

      const schema = fyo.schemaMap[schemaName];
      const records =
        this.optionRecords ??
        (await this.searchRecords(schemaName, schema, keyword));

      return records
        .map((r) => {
          const option = {
            label:
              r[this.secondaryLink] && this.showSecondaryLink
                ? `${r[schema.titleField]}  ` + `  ${r[this.secondaryLink]}`
                : r[schema.titleField],
            value: r.name,
            value2: r[this.secondaryLink],
            value3: r[this.thirdLink],
          };

          if (this.df.groupBy) {
            option.group = r[this.df.groupBy];
          }
          return option;
        })
        .filter(Boolean);
    },
    async searchRecords(schemaName, schema, keyword) {
      const filters = await this.getFilters();
      const fields = [
        ...new Set([
          'name',
          this.secondaryLink,
          this.thirdLink,
          schema.titleField,
          this.df.groupBy,
        ]),
      ].filter(Boolean);

      return await fyo.db.searchLink(
        schemaName,
        keyword,
        filters,
        fields,
        LINK_PAGE_LENGTH
      );
    },
    async getSuggestions(keyword = '') {
      // Given records are filtered here; searched ones were matched by the server.
      let options = sortByFuzzyMatch(
        keyword,
        await this.getOptions(keyword),
        (item) => [item.label, item.value2, item.value3],
        !!this.optionRecords
      );

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
    async openNewDoc() {
      const schemaName = this.df.target;
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

      const filters = await this.getFilters();
      return getCreateFiltersFromListViewFilters(filters);
    },
    async getFilters() {
      const { schemaName, fieldname } = this.df;
      const getFilters = fyo.models[schemaName]?.filters?.[fieldname];

      if (getFilters === undefined) {
        return {};
      }

      if (this.doc) {
        return (await getFilters(this.doc)) ?? {};
      }

      // Filters that read the document cannot apply without one.
      return getFilters.length ? {} : ((await getFilters()) ?? {});
    },
  },
};
</script>
