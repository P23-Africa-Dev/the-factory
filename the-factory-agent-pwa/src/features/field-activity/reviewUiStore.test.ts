import { beforeEach, describe, expect, it } from 'vitest';
import {
  isSoftBannerDismissedToday,
  useFieldActivityReviewUi,
} from './reviewUiStore';

describe('field activity review UI store', () => {
  beforeEach(() => {
    useFieldActivityReviewUi.setState({
      dayReviewOpen: false,
      pileInboxOpen: false,
      softBannerDismissedDate: null,
    });
  });

  it('opens day review and can pile into inbox', () => {
    useFieldActivityReviewUi.getState().openDayReview();
    expect(useFieldActivityReviewUi.getState().dayReviewOpen).toBe(true);

    useFieldActivityReviewUi.getState().openPileInbox();
    expect(useFieldActivityReviewUi.getState().dayReviewOpen).toBe(false);
    expect(useFieldActivityReviewUi.getState().pileInboxOpen).toBe(true);
  });

  it('tracks soft banner dismissal for today', () => {
    useFieldActivityReviewUi.getState().dismissSoftBannerForToday();
    const dismissed = useFieldActivityReviewUi.getState().softBannerDismissedDate;
    expect(isSoftBannerDismissedToday(dismissed)).toBe(true);
    expect(isSoftBannerDismissedToday('2000-01-01')).toBe(false);
  });
});
