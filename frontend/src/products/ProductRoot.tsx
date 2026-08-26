import { useEffect } from 'react';
import MarkTiniApp from './mark-tini/MarkTiniApp';
import TiniOcrApp from './tini-ocr/TiniOcrApp';
import { normalizeProductId, PRODUCT_METADATA } from '../shared/product';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';

function getRuntimeProduct() {
  const electronProduct = window.documark?.productId;
  if (electronProduct) return normalizeProductId(electronProduct);

  // Useful for renderer-only development. Electron always supplies the
  // normalized product through the purpose-specific preload bridge.
  const queryProduct = new URLSearchParams(window.location.search).get('product');
  return normalizeProductId(queryProduct);
}

function MarkTiniWithBoundary() {
  return (
    <ErrorBoundary>
      <MarkTiniApp />
    </ErrorBoundary>
  );
}

function TiniOcrWithBoundary() {
  return (
    <ErrorBoundary>
      <TiniOcrApp />
    </ErrorBoundary>
  );
}

export default function ProductRoot() {
  const productId = getRuntimeProduct();
  useEffect(() => {
    document.title = PRODUCT_METADATA[productId].windowTitle;
  }, [productId]);
  return productId === 'tini-ocr' ? <TiniOcrWithBoundary /> : <MarkTiniWithBoundary />;
}
