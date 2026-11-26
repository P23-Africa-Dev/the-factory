import { describe, expect, it } from 'vitest';
import { fromTimeInput, guessStopTimes, metersBetween, toRecordInput, toTimeInput, validateStopForm, type FormState } from './rules';

const base: FormState = {
  activity: null,
  leadId: null,
  leadName: null,
  locationId: null,
  outcome: null,
  followUpAt: null,
  notes: '',
  place: null,
};

describe('stop form rules (same as the server)', () => {
  it('needs an activity', () => {
    expect(validateStopForm(base)).toMatch(/what you did/);
    expect(validateStopForm({ ...base, activity: 'personal' })).toBeNull();
  });

  it('a customer visit needs the customer and an outcome', () => {
    expect(validateStopForm({ ...base, activity: 'customer_visit' })).toMatch(/customer/);
    expect(validateStopForm({ ...base, activity: 'customer_visit', leadId: 4 })).toMatch(/how the visit went/);
    expect(validateStopForm({ ...base, activity: 'customer_visit', leadId: 4, outcome: 'successful' })).toBeNull();
  });

  it('a lead visit needs an outcome but the lead is optional', () => {
    expect(validateStopForm({ ...base, activity: 'lead_visit' })).toMatch(/how the visit went/);
    expect(validateStopForm({ ...base, activity: 'lead_visit', outcome: 'not_interested' })).toBeNull();
  });

  it('sends only what applies to the activity', () => {
    const input = toRecordInput(
      { ...base, activity: 'personal', leadId: 9, outcome: 'successful', followUpAt: '2026-12-01', notes: '  lunch  ' },
      'live',
    );
    expect(input).toEqual({
      activity: 'personal',
      lead_id: null,
      company_location_id: null,
      outcome: null,
      follow_up_at: null,
      notes: 'lunch',
      via: 'live',
      location: { action: 'confirm' },
    });
  });

  it('keeps the follow-up date only for "Follow-up needed"', () => {
    const f = { ...base, activity: 'customer_visit' as const, leadId: 2, followUpAt: '2026-12-01' };
    expect(toRecordInput({ ...f, outcome: 'follow_up' }, 'review').follow_up_at).toBe('2026-12-01');
    expect(toRecordInput({ ...f, outcome: 'successful' }, 'review').follow_up_at).toBeNull();
  });

  it('a changed place is sent as a correction', () => {
    const input = toRecordInput({ ...base, activity: 'org_visit', locationId: 3, place: { latitude: 6.5, longitude: 3.4, address: 'HQ' } }, 'review');
    expect(input.company_location_id).toBe(3);
    expect(input.location).toEqual({ action: 'correct', latitude: 6.5, longitude: 3.4, address: 'HQ' });
  });
});

describe('missed stop times', () => {
  const trip = { started_at: '2026-11-26T09:00:00Z', ended_at: '2026-11-26T12:00:00Z' };
  const at = (min: number) => new Date(Date.parse(trip.started_at) + min * 60_000).toISOString();

  it('uses the time the route spent near the place', () => {
    const route = {
      coordinates: [
        [3.3, 6.5],
        [3.4, 6.6],
        [3.4, 6.6],
        [3.4001, 6.6],
        [3.5, 6.7],
      ] as [number, number][],
      timestamps: [at(0), at(30), at(45), at(60), at(90)],
    };
    const g = guessStopTimes({ latitude: 6.6, longitude: 3.4 }, route, trip);
    expect(g.arrived.toISOString()).toBe(at(30));
    expect(g.departed.toISOString()).toBe(at(60));
  });

  it('gives at least 10 minutes around the nearest point, inside the trip', () => {
    const route = { coordinates: [[3.3, 6.5]] as [number, number][], timestamps: [at(1)] };
    const g = guessStopTimes({ latitude: 6.9, longitude: 3.9 }, route, trip);
    expect(g.arrived.getTime()).toBe(Date.parse(trip.started_at)); // clamped to the start
    expect(g.departed.getTime() - Date.parse(at(1))).toBe(300_000);
  });

  it('measures distance in metres', () => {
    expect(Math.round(metersBetween([3.4, 6.6], [3.4, 6.6009]))).toBe(100);
  });

  it('time inputs round-trip on the trip day', () => {
    const d = fromTimeInput(new Date(2026, 10, 26, 9, 0), '14:05');
    expect(toTimeInput(d)).toBe('14:05');
    expect(d.getDate()).toBe(26);
  });
});
