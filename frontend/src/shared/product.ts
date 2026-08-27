export type ProductId = 'mark-tini';

export type ProductMetadata = {
  id: ProductId;
  name: string;
  windowTitle: string;
  appUserModelId: string;
  iconFile: string;
};

export const PRODUCT: ProductMetadata = {
  id: 'mark-tini',
  name: 'Mark Tini',
  windowTitle: 'Mark Tini',
  appUserModelId: 'com.dhsystem.marktini',
  iconFile: 'mark-tini.png',
};

export const PRODUCT_ID: ProductId = PRODUCT.id;
