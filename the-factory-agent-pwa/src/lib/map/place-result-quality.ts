/**
 * Result-quality evaluation for Mapbox-primary place search.
 * Mirrored from the dashboard helper so the PWA stays Mapbox-first independently.
 */

export type SuggestQualityInput = {
  name: string;
  placeFormatted: string;
  fullAddress?: string | null;
  featureType?: string;
};

export type SuggestQualityOptions = {
  query?: string;
  minCount?: number;
};

const ADDRESS_LIKE =
  /\d+|street|st\.|road|rd\.|avenue|ave\.|lane|ln\.|drive|dr\.|boulevard|blvd|way|close|court|ct\.|place|pl\./i;

export function areSuggestResultsAcceptable(
  results: SuggestQualityInput[],
  options: SuggestQualityOptions = {},
): boolean {
  const minCount = options.minCount ?? 1;
  if (results.length < minCount) return false;

  const usable = results.filter((r) => {
    const name = r.name?.trim() ?? "";
    const formatted = (r.placeFormatted || r.fullAddress || "").trim();
    return name.length > 0 && formatted.length > 0;
  });

  if (usable.length < minCount) return false;

  const query = options.query?.trim() ?? "";
  if (query && ADDRESS_LIKE.test(query)) {
    const hasAddressish = usable.some((r) => {
      const ft = (r.featureType ?? "").toLowerCase();
      if (ft === "address" || ft === "street" || ft === "poi") return true;
      const formatted = (r.placeFormatted || r.fullAddress || "").trim();
      return formatted.length >= 8 && /[,\d]/.test(formatted);
    });
    if (!hasAddressish) return false;
  }

  return true;
}

export function isForceGooglePrimary(): boolean {
  if (typeof process === "undefined") return false;
  const raw =
    process.env.NEXT_PUBLIC_PLACES_FORCE_GOOGLE_PRIMARY?.trim() ||
    process.env.PLACES_FORCE_GOOGLE_PRIMARY?.trim() ||
    "";
  return raw === "true" || raw === "1";
}
