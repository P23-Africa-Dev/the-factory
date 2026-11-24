import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ForecastView, readForecast } from './ForecastView';

const overview = {
  snapshot: { kpis: {} },
  forecast: {
    narrative: 'Pipeline is steady; two deals at risk.',
    recommendations: ['Follow up with Acme'],
    structured_recommendations: [
      { text: 'Follow up with Acme', priority: 'high' },
      { text: 'Close overdue tasks', priority: 'medium' },
    ],
    risk_level: 'medium',
    confidence: 0.67,
    horizon_days: 7,
  },
};

describe('readForecast', () => {
  it('reads the narrative, recommendations and risk fields', () => {
    expect(readForecast(overview)).toEqual({
      narrative: 'Pipeline is steady; two deals at risk.',
      recommendations: [
        { text: 'Follow up with Acme', priority: 'high' },
        { text: 'Close overdue tasks', priority: 'medium' },
      ],
      riskLevel: 'medium',
      confidencePercent: 67,
      horizonDays: 7,
    });
  });

  it('falls back to plain recommendations', () => {
    expect(readForecast({ forecast: { recommendations: ['Do X', ''] } }).recommendations).toEqual([
      { text: 'Do X', priority: null },
    ]);
  });
});

describe('ForecastView', () => {
  it('renders the forecast instead of raw JSON', () => {
    render(<ForecastView data={overview} />);
    expect(screen.getByText('Pipeline is steady; two deals at risk.')).toBeTruthy();
    expect(screen.getByText('Close overdue tasks')).toBeTruthy();
    expect(screen.getByText('Medium risk')).toBeTruthy();
    expect(screen.getByText('67% confidence')).toBeTruthy();
    expect(screen.queryByText(/"snapshot"/)).toBeNull();
  });

  it('shows the empty state when there is nothing to show', () => {
    render(<ForecastView data={{ snapshot: {} }} />);
    expect(screen.getByText('No forecast data available yet.')).toBeTruthy();
  });
});
