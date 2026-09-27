import { t } from 'fyo';

/** The scanner library the Frappe framework serves for its desk scanner. */
const SCRIPT_URL =
  '/assets/frappe/node_modules/html5-qrcode/html5-qrcode.min.js';

export interface Html5Qrcode {
  isScanning: boolean;
  start(
    camera: { facingMode: 'environment' },
    config: { fps: number; qrbox: { width: number; height: number } },
    onScan: (code: string) => void,
    onFrameWithoutCode: () => void
  ): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

type Html5QrcodeClass = new (
  elementId: string,
  config: { verbose: boolean }
) => Html5Qrcode;

let loading: Promise<Html5QrcodeClass> | undefined;

export function loadHtml5Qrcode(): Promise<Html5QrcodeClass> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.onload = () =>
      resolve(
        (window as unknown as { Html5Qrcode: Html5QrcodeClass }).Html5Qrcode
      );
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error(t`Could not load the barcode scanner.`));
    };
    document.head.append(script);
  });

  return loading;
}
