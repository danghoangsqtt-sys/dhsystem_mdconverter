export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}
