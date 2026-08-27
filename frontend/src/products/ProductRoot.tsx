import MarkTiniApp from './mark-tini/MarkTiniApp';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';

export default function ProductRoot() {
  return (
    <ErrorBoundary>
      <MarkTiniApp />
    </ErrorBoundary>
  );
}
