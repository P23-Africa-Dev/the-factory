export type SavedLocationTypeOption = {
  value: string;
  label: string;
  color: string;
};

export const SAVED_LOCATION_TYPES: SavedLocationTypeOption[] = [
  { value: 'office', label: 'Office', color: '#1D7293' },
  { value: 'warehouse', label: 'Warehouse', color: '#B45309' },
  { value: 'airport', label: 'Airport', color: '#0EA5E9' },
  { value: 'railway_station', label: 'Railway Station', color: '#7C3AED' },
  { value: 'bus_terminal', label: 'Bus Terminal', color: '#CA8A04' },
  { value: 'seaport', label: 'Seaport', color: '#0891B2' },
  { value: 'filling_station', label: 'Filling Station', color: '#DC2626' },
  { value: 'client_site', label: 'Client Site', color: '#2563EB' },
  { value: 'service_center', label: 'Service Center', color: '#0D9488' },
  { value: 'distribution_center', label: 'Distribution Center', color: '#9333EA' },
  { value: 'hospital', label: 'Hospital', color: '#E11D48' },
  { value: 'school', label: 'School', color: '#16A34A' },
  { value: 'hotel', label: 'Hotel', color: '#DB2777' },
  { value: 'restaurant', label: 'Restaurant', color: '#EA580C' },
  { value: 'government_office', label: 'Government Office', color: '#475569' },
  { value: 'retail_store', label: 'Retail Store', color: '#0284C7' },
  { value: 'other', label: 'Other', color: '#64748B' },
];

const DEFAULT_TYPE: SavedLocationTypeOption = {
  value: 'other',
  label: 'Other',
  color: '#64748B',
};

export function getSavedLocationType(
  type: string | null | undefined,
): SavedLocationTypeOption {
  if (!type) return DEFAULT_TYPE;
  return SAVED_LOCATION_TYPES.find((option) => option.value === type) ?? DEFAULT_TYPE;
}

export function getSavedLocationTypeLabel(type: string | null | undefined): string {
  return getSavedLocationType(type).label;
}
