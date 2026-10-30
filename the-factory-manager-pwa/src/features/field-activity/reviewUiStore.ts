import { create } from 'zustand';

type FieldActivityReviewUiState = {
  dayReviewOpen: boolean;
  pileInboxOpen: boolean;
  softBannerDismissedDate: string | null;
  openDayReview: () => void;
  closeDayReview: () => void;
  openPileInbox: () => void;
  closePileInbox: () => void;
  dismissSoftBannerForToday: () => void;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useFieldActivityReviewUi = create<FieldActivityReviewUiState>((set) => ({
  dayReviewOpen: false,
  pileInboxOpen: false,
  softBannerDismissedDate: null,
  openDayReview: () => set({ dayReviewOpen: true }),
  closeDayReview: () => set({ dayReviewOpen: false }),
  openPileInbox: () => set({ pileInboxOpen: true, dayReviewOpen: false }),
  closePileInbox: () => set({ pileInboxOpen: false }),
  dismissSoftBannerForToday: () => set({ softBannerDismissedDate: todayKey() }),
}));

export function isSoftBannerDismissedToday(dismissedDate: string | null): boolean {
  return dismissedDate === todayKey();
}
