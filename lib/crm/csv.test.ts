import { describe, expect, it } from "vitest";

import { dropEmptyColumns, parseCsvContent } from "@/lib/crm/csv";

describe("dropEmptyColumns", () => {
    it("drops columns with no value in any row, with or without a header", () => {
        const parsed = parseCsvContent(
            [
                "Name,Email,Notes,,Phone,",
                "Ada,ada@example.com,,,0801,",
                "Luca,,  ,,0802,",
            ].join("\n"),
        );

        const result = dropEmptyColumns(parsed);

        expect(result.headers).toEqual(["Name", "Email", "Phone"]);
        expect(result.rows).toEqual([
            ["Ada", "ada@example.com", "0801"],
            ["Luca", "", "0802"],
        ]);
        expect(result.skippedColumns).toEqual(["Notes", "Column 4", "Column 6"]);
    });

    it("keeps a column when at least one row has a value", () => {
        const parsed = parseCsvContent("Name,Budget\nAda,\nLuca,500\n");

        const result = dropEmptyColumns(parsed);

        expect(result.headers).toEqual(["Name", "Budget"]);
        expect(result.skippedColumns).toEqual([]);
    });

    it("handles ragged rows shorter than the header", () => {
        const parsed = { headers: ["Name", "City", "Extra"], rows: [["Ada"], ["Luca", "Lagos"]] };

        const result = dropEmptyColumns(parsed);

        expect(result.headers).toEqual(["Name", "City"]);
        expect(result.rows).toEqual([
            ["Ada", ""],
            ["Luca", "Lagos"],
        ]);
        expect(result.skippedColumns).toEqual(["Extra"]);
    });
});
