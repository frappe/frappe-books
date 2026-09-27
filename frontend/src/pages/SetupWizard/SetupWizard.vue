<template>
  <div v-if="isMobile" class="flex h-full flex-col bg-surface-base">
    <div class="flex-1 overflow-y-auto">
      <div
        class="flex flex-col items-center gap-2.5 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+1.75rem)] text-center"
      >
        <img :src="appIconUrl" alt="" class="size-14" />
        <h1 class="mt-1.5 text-4xl-semibold text-ink-gray-9">
          {{ t`Set up your organization` }}
        </h1>
        <p class="text-base text-ink-gray-6">
          {{ t`Step ${step + 1} of ${steps.length} · ${stepTitle}` }}
        </p>
        <div class="mt-1 w-full max-w-[220px]">
          <FrappeProgress
            size="md"
            :value="((step + 1) / steps.length) * 100"
            :intervals="steps.length"
          />
        </div>
      </div>
      <CommonFormSection
        v-if="hasDoc"
        class="p-4"
        :fields="steps[step][1]"
        :doc="doc"
        :errors="errors"
        @value-change="onValueChange"
      />
    </div>
    <div
      class="flex gap-2 border-t border-outline-gray-1 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <FrappeButton
        v-if="step > 0"
        class="flex-1"
        size="lg"
        :label="t`Back`"
        :disabled="loading"
        @click="step -= 1"
      />
      <FrappeButton
        v-if="isLastStep"
        class="flex-[2]"
        size="lg"
        variant="solid"
        data-testid="submit-button"
        :label="t`Submit`"
        :disabled="!areAllValuesFilled"
        :loading="loading"
        @click="submit"
      />
      <FrappeButton
        v-else
        class="flex-[2]"
        size="lg"
        variant="solid"
        :label="t`Next`"
        :disabled="!isStepFilled"
        @click="step += 1"
      />
    </div>
  </div>
  <FormContainer
    v-else
    :show-header="false"
    class="justify-content items-center h-full"
  >
    <template #body>
      <FormHeader
        :form-title="t`Set up your organization`"
        class="
          sticky
          top-0
          bg-surface-base
          border-b
          border-outline-gray-1
        "
      >
      </FormHeader>

      <!-- Section Container -->
      <div
        v-if="hasDoc"
        class="overflow-auto custom-scroll custom-scroll-thumb1"
      >
        <CommonFormSection
          v-for="([name, fields], idx) in activeGroup.entries()"
          :key="name + idx"
          ref="section"
          class="p-4"
          :class="
            idx !== 0 && activeGroup.size > 1
              ? 'border-t border-outline-gray-1'
              : ''
          "
          :show-title="activeGroup.size > 1 && name !== t`Default`"
          :title="name"
          :fields="fields"
          :doc="doc"
          :errors="errors"
          :collapsible="false"
          @value-change="onValueChange"
        />
      </div>

      <!-- Buttons Bar -->
      <div
        class="
          mt-auto
          p-4
          flex
          items-center
          justify-between
          border-t
          border-outline-gray-1
          flex-shrink-0
          sticky
          bottom-0
          bg-surface-base
        "
      >
        <FrappeButton
          variant="outline"
          class="w-24"
          :disabled="loading"
          @click="cancel"
          >{{ t`Cancel` }}</FrappeButton>
        <FrappeButton
          v-if="fyo.store.isDevelopment"
          variant="outline"
          class="w-24 ml-auto mr-4"
          :disabled="loading"
          @click="fill"
          >{{ t`Fill` }}</FrappeButton>
        <FrappeButton
          variant="solid"
          class="w-24"
          data-testid="submit-button"
          :disabled="!areAllValuesFilled"
          :loading="loading"
          @click="submit"
          >{{ t`Submit` }}</FrappeButton>
      </div>
    </template>
  </FormContainer>
</template>
<script lang="ts">
import { Button as FrappeButton, Progress as FrappeProgress } from 'frappe-ui';
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { Field } from 'schemas/types';
import FormContainer from 'src/components/FormContainer.vue';
import FormHeader from 'src/components/FormHeader.vue';
import { getErrorMessage } from 'src/utils';
import { showDialog } from 'src/utils/interactive';
import { getSetupWizardDoc } from 'src/utils/misc';
import { getFieldsGroupedByTabAndSection } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { appIconUrl } from 'src/web/pwa';
import { computed, defineComponent } from 'vue';
import CommonFormSection from '../CommonForm/CommonFormSection.vue';

export default defineComponent({
  name: 'SetupWizard',
  components: {
    FrappeButton,
    FrappeProgress,
    FormContainer,
    FormHeader,
    CommonFormSection,
  },
  provide() {
    return {
      doc: computed(() => this.docOrNull),
    };
  },
  emits: ['setup-complete', 'setup-canceled'],
  setup() {
    return { isMobile, appIconUrl };
  },
  data() {
    return {
      docOrNull: null,
      errors: {},
      loading: false,
      step: 0,
    } as {
      errors: Record<string, string>;
      docOrNull: null | Doc;
      loading: boolean;
      step: number;
    };
  },
  computed: {
    hasDoc(): boolean {
      return this.docOrNull instanceof Doc;
    },
    doc(): Doc {
      if (this.docOrNull instanceof Doc) {
        return this.docOrNull;
      }

      throw new Error(`Doc is null`);
    },
    areAllValuesFilled(): boolean {
      if (!this.hasDoc) {
        return false;
      }

      return this.hasRequiredValues(this.doc.schema.fields);
    },
    /** Phones show one schema section per step. */
    steps(): [string, Field[]][] {
      return [...this.activeGroup.entries()];
    },
    stepTitle(): string {
      const name = this.steps[this.step]?.[0] ?? '';
      return name === this.t`Default` ? this.t`Company` : name;
    },
    isLastStep(): boolean {
      return this.step === this.steps.length - 1;
    },
    isStepFilled(): boolean {
      return this.hasRequiredValues(this.steps[this.step]?.[1] ?? []);
    },
    activeGroup(): Map<string, Field[]> {
      if (!this.hasDoc) {
        return new Map();
      }

      const groupedFields = getFieldsGroupedByTabAndSection(
        this.doc.schema,
        this.doc
      );

      return [...groupedFields.values()][0];
    },
  },
  mounted() {
    this.docOrNull = getSetupWizardDoc();
  },
  methods: {
    hasRequiredValues(fields: Field[]): boolean {
      return fields
        .filter((f) => f.required)
        .every((f) => Boolean(this.doc[f.fieldname]));
    },
    async fill() {
      if (!this.hasDoc) {
        return;
      }

      await this.doc.set('companyName', "Lin's Things");
      await this.doc.set('email', 'lin@lthings.com');
      await this.doc.set('fullname', 'Lin Slovenly');
      await this.doc.set('bankName', 'Max Finance');
      await this.doc.set('country', 'India');
    },
    async onValueChange(field: Field, value: DocValue) {
      if (!this.hasDoc) {
        return;
      }

      const { fieldname } = field;
      delete this.errors[fieldname];

      try {
        await this.doc.set(fieldname, value);
      } catch (err) {
        if (!(err instanceof Error)) {
          return;
        }

        this.errors[fieldname] = getErrorMessage(err, this.doc);
      }
    },
    async submit() {
      if (!this.hasDoc) {
        return;
      }

      if (!this.areAllValuesFilled) {
        return await showDialog({
          title: this.t`Mandatory Error`,
          detail: this.t`Please fill all values.`,
          type: 'error',
        });
      }

      this.loading = true;
      this.$emit('setup-complete', this.doc.getValidDict());
    },
    cancel() {
      this.$emit('setup-canceled');
    },
  },
});
</script>
