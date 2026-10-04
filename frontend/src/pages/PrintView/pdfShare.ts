import { handleErrorWithDialog } from 'src/errorHandling';
import { showToast } from 'src/utils/interactive';
import { ref } from 'vue';

/**
 * Hands a PDF to the system share sheet. Fetching the PDF can outlast the tap
 * the browser needs to share, so the PDF is kept and the next tap shares it.
 */
export function usePDFShare(retryMessage: string) {
  const isSharing = ref(false);
  let kept: { key: string; file: File } | null = null;

  async function share(
    key: string,
    title: string,
    getPDF: () => Promise<File>
  ): Promise<void> {
    isSharing.value = true;
    try {
      if (kept?.key !== key) {
        kept = { key, file: await getPDF() };
      }

      await navigator.share({ files: [kept.file], title });
    } catch (error) {
      await handleShareError(error, retryMessage);
    } finally {
      isSharing.value = false;
    }
  }

  function clearKeptPDF() {
    kept = null;
  }

  return { isSharing, share, clearKeptPDF };
}

async function handleShareError(error: unknown, retryMessage: string) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'AbortError') {
    return;
  }

  if (name === 'NotAllowedError') {
    showToast({ message: retryMessage });
    return;
  }

  await handleErrorWithDialog(error as Error);
}
