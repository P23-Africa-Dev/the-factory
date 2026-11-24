'use client';

/**
 * Body of the manager "Operations & Sales Forecast" modal. GET
 * /copilot/forecast/overview returns `{snapshot, forecast: {narrative,
 * recommendations, structured_recommendations, risk_level, confidence, ...}}`.
 */

interface ForecastRecommendation {
  text: string;
  priority: string | null;
}

export interface ForecastSummary {
  narrative: string;
  recommendations: ForecastRecommendation[];
  riskLevel: string | null;
  /** 0–100, rounded. */
  confidencePercent: number | null;
  horizonDays: number | null;
}

export function readForecast(data: Record<string, unknown> | null | undefined): ForecastSummary {
  const forecast = (data?.forecast && typeof data.forecast === 'object'
    ? data.forecast
    : data ?? {}) as Record<string, unknown>;

  const structured = Array.isArray(forecast.structured_recommendations)
    ? (forecast.structured_recommendations as unknown[])
        .map((item): ForecastRecommendation | null => {
          if (!item || typeof item !== 'object') return null;
          const row = item as Record<string, unknown>;
          const text = typeof row.text === 'string' ? row.text.trim() : '';
          if (!text) return null;
          return { text, priority: typeof row.priority === 'string' ? row.priority : null };
        })
        .filter((r): r is ForecastRecommendation => r !== null)
    : [];
  const plain = Array.isArray(forecast.recommendations)
    ? (forecast.recommendations as unknown[])
        .filter((r): r is string => typeof r === 'string' && r.trim() !== '')
        .map((text) => ({ text: text.trim(), priority: null }))
    : [];

  const narrative =
    (typeof forecast.narrative === 'string' && forecast.narrative.trim()) ||
    (typeof data?.summary === 'string' && data.summary.trim()) ||
    '';
  const confidence = typeof forecast.confidence === 'number' ? forecast.confidence : null;

  return {
    narrative,
    recommendations: structured.length > 0 ? structured : plain,
    riskLevel: typeof forecast.risk_level === 'string' ? forecast.risk_level : null,
    confidencePercent:
      confidence === null ? null : Math.round(confidence <= 1 ? confidence * 100 : confidence),
    horizonDays: typeof forecast.horizon_days === 'number' ? forecast.horizon_days : null,
  };
}

const riskStyles: Record<string, string> = {
  high: 'bg-[#FD6046]/15 border-[#FD6046]/40 text-[#FD6046]',
  medium: 'bg-[#F5B544]/15 border-[#F5B544]/40 text-[#F5B544]',
  low: 'bg-[#75ADAF]/15 border-[#75ADAF]/40 text-[#75ADAF]',
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ForecastView({ data }: { data: Record<string, unknown> }) {
  const forecast = readForecast(data);
  const hasStats = forecast.riskLevel !== null || forecast.confidencePercent !== null;

  if (!forecast.narrative && forecast.recommendations.length === 0 && !hasStats) {
    return <p className="text-xs text-white/60 text-center py-8">No forecast data available yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {hasStats && (
        <div className="flex flex-wrap gap-2">
          {forecast.riskLevel && (
            <span
              className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${
                riskStyles[forecast.riskLevel] ?? 'bg-white/5 border-white/15 text-white/80'
              }`}
            >
              {capitalize(forecast.riskLevel)} risk
            </span>
          )}
          {forecast.confidencePercent !== null && (
            <span className="px-2.5 py-1 rounded-full border border-white/15 bg-white/5 text-[11px] font-bold text-white/80">
              {forecast.confidencePercent}% confidence
            </span>
          )}
          {forecast.horizonDays !== null && (
            <span className="px-2.5 py-1 rounded-full border border-white/15 bg-white/5 text-[11px] font-bold text-white/80">
              Next {forecast.horizonDays} days
            </span>
          )}
        </div>
      )}

      {forecast.narrative && (
        <p className="text-xs text-white/85 leading-relaxed whitespace-pre-line">{forecast.narrative}</p>
      )}

      {forecast.recommendations.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#75ADAF]">Recommendations</h4>
          <ul className="flex flex-col gap-2">
            {forecast.recommendations.map((rec, index) => (
              <li
                key={index}
                className="flex items-start gap-2 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5 text-xs text-white/85 leading-relaxed"
              >
                <span className="flex-1">{rec.text}</span>
                {rec.priority === 'high' && (
                  <span className="flex-shrink-0 text-[10px] font-bold uppercase text-[#FD6046]">High</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
