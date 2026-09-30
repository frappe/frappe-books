<script>
import { toSchemaName } from 'src/frappe/registry';
import Link from './Link.vue';
export default {
  name: 'DynamicLink',
  extends: Link,
  inject: {
    report: { default: null },
  },
  props: ['target'],
  created() {
    const watchKey = `doc.${this.df.references}`;
    this.targetWatcher = this.$watch(watchKey, function (newTarget, oldTarget) {
      if (oldTarget && newTarget !== oldTarget) {
        this.triggerChange('');
      }
    });
  },
  unmounted() {
    this.targetWatcher();
  },
  methods: {
    getTargetSchemaName() {
      const references = this.df.references;
      if (!references) {
        return null;
      }

      let schemaName = this.doc?.[references];
      if (!schemaName) {
        schemaName = this.report?.[references];
      }

      if (!schemaName) {
        return null;
      }

      return toSchemaName(schemaName) ?? null;
    },
  },
};
</script>
