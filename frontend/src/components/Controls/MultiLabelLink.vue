<script>
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { fuzzyMatch } from 'src/utils';
import { linkOnSave } from 'src/utils/doc';
import { getCreateFiltersFromListViewFilters } from 'src/utils/misc';
import AutoComplete from './AutoComplete.vue';

export default {
  name: 'MultiLabelLink',
  extends: AutoComplete,
  data() {
    return { results: [] };
  },
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
      const { fieldname, target } = this.df ?? {};
      const linkDisplayField = fyo.schemaMap[target ?? '']?.linkDisplayField;

      if (!linkDisplayField) {
        return (this.linkValue = value);
      }

      const linkDoc = await this.doc?.loadAndGetLink(fieldname);
      this.linkValue = linkDoc?.get(linkDisplayField) ?? '';
    },
    getTargetSchemaName() {
      return this.df.target;
    },
    async getOptions() {
      const schemaName = this.getTargetSchemaName();

      if (!schemaName) {
        return [];
      }

      const schema = fyo.schemaMap[schemaName];
      const records =
        this.optionRecords ?? (await this.getOptionRecords(schemaName, schema));

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
    async getOptionRecords(schemaName, schema) {
      if (this.results?.length) {
        return this.results;
      }

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

      return (this.results = await fyo.db.getAll(schemaName, {
        filters,
        fields,
      }));
    },
    async getSuggestions(keyword = '') {
      let options = await this.getOptions();

      if (keyword) {
        options = options
          .map((item) => ({ ...this.getSuggestionMatch(keyword, item), item }))
          .filter(({ isMatch }) => isMatch)
          .sort((a, b) => a.distance - b.distance)
          .map(({ item }) => item);
      }

      if (this.doc && this.df.create && this.canCreateTarget()) {
        options = options.concat(this.getCreateNewOption());
      }

      return options;
    },
    getSuggestionMatch(keyword, item) {
      const searchValues = [item.label, item.value2, item.value3].filter(
        (value) => value !== undefined && value !== null && String(value)
      );

      return searchValues.reduce(
        (bestMatch, value) => {
          const match = fuzzyMatch(keyword, String(value));
          return match.isMatch && match.distance < bestMatch.distance
            ? match
            : bestMatch;
        },
        { isMatch: false, distance: Number.MAX_SAFE_INTEGER }
      );
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
        this.results = [];
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
