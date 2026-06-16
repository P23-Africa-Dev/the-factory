/**
 * Toast utility — wraps sonner for consistent toast API across the app.
 * Matches the mobile app's toast.ts surface so feature code ports cleanly.
 */
import { toast as sonnerToast } from 'sonner';

export const toast = {
  success(title: string, description?: string) {
    sonnerToast.success(title, { description });
  },
  error(title: string, description?: string) {
    sonnerToast.error(title, { description });
  },
  info(title: string, description?: string) {
    sonnerToast.info(title, { description });
  },
  warning(title: string, description?: string) {
    sonnerToast.warning(title, { description });
  },
};
