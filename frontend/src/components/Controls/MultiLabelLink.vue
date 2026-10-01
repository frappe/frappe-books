<script>
import { t } from 'fyo';
import { getSchema } from 'src/frappe/registry';
import { sortByFuzzyMatch } from 'src/utils';
import Link from './Link.vue';

/**
 * A Link whose options also match other fields of their records, like a
 * party's phone, or the given `optionRecords` instead of a search.
 */
export default {
  name: 'MultiLabelLink',
  extends: Link,
  props: {
    optionRecords: {
      type: Array,
      default: null,
    },
    secondaryLink: String,
    thirdLink: String,
  },
  methods: {
    async getOptions(keyword, filters) {
      const fields = [this.secondaryLink, this.thirdLink].filter(Boolean);
      const options = this.optionRecords
        ? this.getRecordOptions()
        : await this.searchOptions(keyword, filters, fields);
      return options.map(({ record, ...option }) => ({
        ...option,
        value2: record[this.secondaryLink],
        value3: record[this.thirdLink],
      }));
    },
    getRecordOptions() {
      const { titleField } = getSchema(this.getTargetSchemaName());
      return this.optionRecords.map((record) => ({
        label: record[titleField],
        value: record.name,
        record,
      }));
    },
    async getSuggestions(keyword = '') {
      const filters = await this.getFilters();
      // Given records are filtered here; searched ones were matched by the server.
      let options = sortByFuzzyMatch(
        keyword,
        await this.getOptions(keyword, filters),
        (item) => [item.label, item.value2, item.value3],
        !!this.optionRecords
      );

      if (this.doc && this.df.create && this.canCreateTarget()) {
        options = options.concat(this.getCreateNewOption());
      }

      return options;
    },
    getCreateNewOption() {
      return {
        label: t`Create`,
        description: this.searchQuery || undefined,
        action: () => this.openNewDoc(),
        actionOnly: true,
      };
    },
  },
};
</script>
