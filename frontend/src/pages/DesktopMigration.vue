<template>
  <div class="flex h-full w-full flex-col overflow-hidden">
    <PageHeader title="Migrate from Desktop App" />
    <FrappeScrollArea class="min-h-0 flex-1">
      <div class="mx-auto max-w-2xl px-4 py-8">
        <div class="bg-white rounded border p-6 space-y-6">
          
          <div class="space-y-2">
            <h2 class="text-xl font-bold">Frappe Books Desktop Migration</h2>
            <p class="text-ink-gray-6">
              Upload your old frappe-books.db SQLite database file below. The system will automatically import all of your customers, items, invoices, custom print templates, and perfectly rebuild your General Ledger.
            </p>
          </div>

          <div v-if="!isMigrating && !isSuccess">
            <FrappeFileUploader
              :fileTypes="['.db', '.sqlite']"
              @success="onFileUploaded"
            >
              <template #default="{ openFileSelector }">
                <FrappeButton
                  icon-left="lucide-upload"
                  :label="uploadedFileUrl ? 'Change Database File' : 'Upload frappe-books.db'"
                  @click="openFileSelector"
                />
              </template>
            </FrappeFileUploader>
            
            <div v-if="uploadedFileUrl" class="mt-4 p-3 bg-gray-50 rounded border flex items-center justify-between">
              <span class="text-sm font-medium">{{ uploadedFileName }}</span>
              <FrappeButton
                variant="solid"
                label="Start Migration"
                @click="startMigration"
              />
            </div>
          </div>
          
          <div v-else-if="isMigrating" class="py-12 flex flex-col items-center justify-center space-y-4">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p class="text-ink-gray-7 font-medium">Migration in progress. Please do not close this window...</p>
          </div>
          
          <div v-else-if="isSuccess" class="py-12 flex flex-col items-center justify-center space-y-4 text-center">
            <div class="text-green-500">
              <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-900">Migration Complete!</h3>
            <p class="text-ink-gray-6">Your data and templates have been successfully migrated to Frappe Books Web.</p>
            <FrappeButton variant="solid" label="Go to Dashboard" @click="goToDashboard" class="mt-4" />
          </div>

        </div>
      </div>
    </FrappeScrollArea>
  </div>
</template>

<script setup lang="ts">
import {
  Button as FrappeButton,
  FileUploader as FrappeFileUploader,
  ScrollArea as FrappeScrollArea,
} from 'frappe-ui';
import PageHeader from 'src/components/PageHeader.vue';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { call } from 'src/web/api';

const router = useRouter();

const uploadedFileUrl = ref<string | null>(null);
const uploadedFileName = ref('');
const isMigrating = ref(false);
const isSuccess = ref(false);

const onFileUploaded = (file: any) => {
  uploadedFileUrl.value = file.file_url;
  uploadedFileName.value = file.file_name;
};

const startMigration = async () => {
  if (!uploadedFileUrl.value) return;
  
  isMigrating.value = true;
  try {
    await call(
      'frappe_books.desktop_migration.trigger_desktop_migration',
      { file_url: uploadedFileUrl.value }
    );
    isSuccess.value = true;
  } catch (error: any) {
    console.error(error);
  } finally {
    isMigrating.value = false;
  }
};

const goToDashboard = () => {
  router.push('/');
};
</script>
