export const PRODUCT_IDS = ['mark-tini', 'tini-ocr'] as const;

export type ProductId = (typeof PRODUCT_IDS)[number];

export type ProductMetadata = {
  id: ProductId;
  name: string;
  windowTitle: string;
  appUserModelId: string;
  iconFile: string;
  storageNamespace: string;
};

export const DEFAULT_PRODUCT_ID: ProductId = 'mark-tini';

export const PRODUCT_METADATA: Record<ProductId, ProductMetadata> = {
  'mark-tini': {
    id: 'mark-tini',
    name: 'Mark Tini',
    windowTitle: 'Mark Tini',
    appUserModelId: 'com.dhsystem.tinisuite.marktini',
    iconFile: 'mark-tini.png',
    storageNamespace: 'mark-tini',
  },
  'tini-ocr': {
    id: 'tini-ocr',
    name: 'Tini OCR',
    windowTitle: 'Tini OCR — Image to Text & Word',
    appUserModelId: 'com.dhsystem.tinisuite.ocr',
    iconFile: 'tini-ocr.png',
    storageNamespace: 'tini-ocr',
  },
};

export function normalizeProductId(value: unknown): ProductId {
  return typeof value === 'string' && PRODUCT_IDS.includes(value as ProductId)
    ? value as ProductId
    : DEFAULT_PRODUCT_ID;
}

export function productIdFromArguments(argumentsList: readonly string[]): ProductId {
  const productArgument = argumentsList.find(argument => argument.startsWith('--product='));
  return normalizeProductId(productArgument?.slice('--product='.length));
}

export function productStorageKey(productId: ProductId, key: string): string {
  return `tini-suite:${PRODUCT_METADATA[productId].storageNamespace}:${key}`;
}
