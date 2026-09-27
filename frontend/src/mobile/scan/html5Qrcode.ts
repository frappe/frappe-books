import { t } from 'fyo';

/** The scanner library the Frappe framework serves for its desk scanner. */
const SCRIPT_URL =
  '/assets/frappe/node_modules/html5-qrcode/html5-qrcode.min.js';

/** Retail and shelf codes; fewer formats decode faster. */
const FORMATS = [
  'QR_CODE',
  'EAN_13',
  'EAN_8',
  'UPC_A',
  'UPC_E',
  'CODE_128',
  'CODE_39',
  'CODE_93',
  'CODABAR',
  'ITF',
] as const;

type Box = { width: number; height: number };

export interface Html5Qrcode {
  isScanning: boolean;
  start(
    camera: { facingMode: 'environment' },
    config: {
      fps: number;
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => Box;
      videoConstraints: MediaTrackConstraints;
    },
    onScan: (code: string) => void,
    onFrameWithoutCode: () => void
  ): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

interface Html5QrcodeLibrary {
  Html5Qrcode: new (
    elementId: string,
    config: {
      verbose: boolean;
      formatsToSupport: number[];
      experimentalFeatures: { useBarCodeDetectorIfSupported: boolean };
    }
  ) => Html5Qrcode;
  Html5QrcodeSupportedFormats: Record<(typeof FORMATS)[number], number>;
}

let loading: Promise<Html5QrcodeLibrary> | undefined;

function loadLibrary(): Promise<Html5QrcodeLibrary> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.onload = () => resolve(window as unknown as Html5QrcodeLibrary);
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error(t`Could not load the barcode scanner.`));
    };
    document.head.append(script);
  });

  return loading;
}

/** Starts the rear camera in the element and reports each code it reads. */
export async function startScanner(
  elementId: string,
  onScan: (code: string) => void
): Promise<Html5Qrcode> {
  const library = await loadLibrary();
  const scanner = new library.Html5Qrcode(elementId, {
    verbose: false,
    formatsToSupport: FORMATS.map(
      (format) => library.Html5QrcodeSupportedFormats[format]
    ),
    // Android Chrome's own detector is faster; iOS falls back to the library.
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  });

  await scanner.start(
    { facingMode: 'environment' },
    {
      fps: 10,
      // Wide barcodes fill the view, so the scan area spans nearly all of it.
      qrbox: (width, height) => ({
        width: Math.floor(width * 0.9),
        height: Math.max(80, Math.floor(height * 0.5)),
      }),
      // iOS gives 640x480 unless asked, too coarse for thin bars.
      videoConstraints: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
    onScan,
    () => undefined
  );

  return scanner;
}
