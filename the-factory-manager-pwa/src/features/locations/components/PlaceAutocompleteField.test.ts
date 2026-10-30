import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlaceAutocompleteField } from './PlaceAutocompleteField';

const mocks = vi.hoisted(() => ({ suggest: vi.fn(), retrieve: vi.fn() }));
vi.mock('@/lib/map/place-search', () => ({
  createSearchSessionToken: () => 'session',
  suggestPlaces: mocks.suggest,
  retrievePlace: mocks.retrieve,
}));
vi.mock('@/lib/map/search-proximity', () => ({
  getCachedSearchProximity: () => [3, 6],
  warmSearchProximity: vi.fn(),
}));
vi.mock('@/lib/map/recentDestinations', () => ({
  getRecentDestinations: () => [],
  fetchRecentDestinations: async () => [],
  rememberRecentDestination: vi.fn(),
}));

function Fields() {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const onPlaceSelect = (place: { name: string; address: string }) => {
    setName(place.name);
    setAddress(place.address);
  };
  return React.createElement(React.Fragment, null,
    React.createElement(PlaceAutocompleteField, { value: name, onChange: setName, onPlaceSelect, placeholder: 'Location' }),
    React.createElement(PlaceAutocompleteField, { value: address, onChange: setAddress, onPlaceSelect, placeholder: 'Address' }),
  );
}

beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.useFakeTimers();
  mocks.suggest.mockResolvedValue([{ provider: 'test', id: '1', name: 'Selected place', placeFormatted: 'Selected address' }]);
  mocks.retrieve.mockResolvedValue({ name: 'Selected place', address: 'Selected address', lat: 6, lng: 3 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(['Location', 'Address'])('keeps both panels closed after selecting from %s and resumes searching on edits', async (field) => {
  render(React.createElement(Fields));
  const input = screen.getByPlaceholderText(field);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Selected' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  fireEvent.mouseDown(screen.getByRole('button', { name: /Selected place/ }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.queryByRole('list')).toBeNull();
  expect(mocks.suggest).toHaveBeenCalledTimes(1);
  expect((screen.getByPlaceholderText('Location') as HTMLInputElement).value).toBe('Selected place');
  expect((screen.getByPlaceholderText('Address') as HTMLInputElement).value).toBe('Selected address');
  fireEvent.change(input, { target: { value: 'Another' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(mocks.suggest).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('list')).not.toBeNull();
});
