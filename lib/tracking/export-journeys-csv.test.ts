import { describe, expect, it, vi } from "vitest";
import type { JourneyCard } from "@/lib/api/field-activity";
import {
  buildJourneysCsv,
  buildStopsCsv,
  csvEscape,
  downloadTextFile,
  fetchAllPages,
  fileSlug,
  mapWithConcurrency,
} from "@/lib/tracking/export-journeys-csv";

function trip(overrides: Partial<JourneyCard> = {}): JourneyCard {
  return {
    id: 1,
    date: "2026-07-29",
    status: "completed",
    clock_in_at: null,
    clock_out_at: null,
    distance_meters: 1200,
    travel_seconds: 600,
    stationary_seconds: 300,
    active_seconds: 3700,
    stop_count: 1,
    visit_count: 1,
    unknown_stop_count: 0,
    travel_efficiency: 0.756,
    narrative: null,
    attendance_record_id: null,
    source: "field_trip",
    started_at: "2026-07-29T09:00:00+01:00",
    ended_at: "2026-07-29T10:00:00+01:00",
    end_reason: "user",
    ...overrides,
  };
}

describe("csvEscape", () => {
  it("neutralises spreadsheet formulas", () => {
    expect(csvEscape("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvEscape("+1+1")).toBe("'+1+1");
    expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvEscape("-2+3")).toBe("'-2+3");
  });

  it("leaves numbers and plain text alone, quoting when needed", () => {
    expect(csvEscape(-12.5)).toBe("-12.5");
    expect(csvEscape("-12.5")).toBe("-12.5");
    expect(csvEscape("Lagos, Ikeja")).toBe('"Lagos, Ikeja"');
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(Number.NaN)).toBe("");
  });
});

describe("CSV builders", () => {
  it("builds one row per trip", () => {
    const csv = buildJourneysCsv([trip(), trip({ id: 2, source: "attendance" })], "=Evil Name");
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("trip_id");
    expect(lines[1]).toContain("Field trip");
    expect(lines[1]).toContain("'=Evil Name");
    expect(lines[1]).toContain("1h 1m");
    expect(lines[2]).toContain("Clock-in day");
  });

  it("builds one row per stop", () => {
    const csv = buildStopsCsv(
      [
        {
          journey: { id: 7, date: "2026-07-29" },
          stops: [
            {
              id: 70,
              field_activity_session_id: 7,
              arrived_at: "2026-07-29T09:10:00Z",
              departed_at: "2026-07-29T09:30:00Z",
              latitude: 6.5,
              longitude: 3.3,
              address: "12 Allen Ave, Ikeja",
              duration_seconds: 1200,
              classification: "customer_visit",
              classified_by: null,
              classified_at: null,
              lead_id: null,
            },
          ],
        },
      ],
      "Amara",
    );
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '7,2026-07-29,Amara,70,2026-07-29T09:10:00Z,2026-07-29T09:30:00Z,1200,customer_visit,"12 Allen Ave, Ikeja",6.5,3.3',
    );
  });
});

describe("paging helpers", () => {
  it("fetches every page in order", async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      items: [page * 10, page * 10 + 1],
      pagination: { current_page: page, last_page: 3 },
    }));
    await expect(fetchAllPages(fetchPage)).resolves.toEqual([10, 11, 20, 21, 30, 31]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("limits concurrency and keeps order", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5 - n));
      inFlight -= 1;
      return n * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("slugs file names", () => {
    expect(fileSlug("Jane O'Doe")).toBe("jane-o-doe");
    expect(fileSlug("***")).toBe("export");
  });
});

describe("downloadTextFile", () => {
  it("adds a UTF-8 BOM and clicks an attached link", async () => {
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:x";
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(document.body.contains(this)).toBe(true);
      expect(this.download).toBe("trips.csv");
    });

    downloadTextFile("trips.csv", "a,b");
    expect(click).toHaveBeenCalledTimes(1);
    // Blob.text() would strip the BOM while decoding: check the raw bytes.
    const bytes = new Uint8Array(await created[0].arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe("a,b");
  });
});
