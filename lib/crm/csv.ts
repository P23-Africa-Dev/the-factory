/**
 * Minimal RFC 4180 CSV parsing/serialization used by the CRM import/export flow.
 * Handles quoted fields, escaped quotes, commas and newlines inside quotes.
 */

export type ParsedCsv = {
    headers: string[];
    rows: string[][];
};

export function parseCsvContent(content: string): ParsedCsv {
    const records: string[][] = [];
    let field = "";
    let record: string[] = [];
    let inQuotes = false;

    const pushField = () => {
        record.push(field);
        field = "";
    };
    const pushRecord = () => {
        pushField();
        // Skip records that are entirely empty (blank lines).
        if (record.some((value) => value.trim() !== "")) {
            records.push(record);
        }
        record = [];
    };

    for (let i = 0; i < content.length; i++) {
        const char = content[i];

        if (inQuotes) {
            if (char === '"') {
                if (content[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') {
            inQuotes = true;
        } else if (char === ",") {
            pushField();
        } else if (char === "\n") {
            pushRecord();
        } else if (char === "\r") {
            if (content[i + 1] === "\n") i++;
            pushRecord();
        } else {
            field += char;
        }
    }

    if (field !== "" || record.length > 0) {
        pushRecord();
    }

    if (records.length === 0) {
        return { headers: [], rows: [] };
    }

    const [headerRow, ...rows] = records;
    // Strip a UTF-8 BOM if present on the first header cell.
    const headers = headerRow.map((h, idx) => (idx === 0 ? h.replace(/^\uFEFF/, "") : h).trim());

    return { headers, rows };
}

export type CsvWithoutEmptyColumns = ParsedCsv & {
    /** Display names of the columns that were dropped ("Column N" when the header is blank). */
    skippedColumns: string[];
};

/**
 * Drop columns that have no value in any data row (with or without a header).
 * Such columns (often stray, formatted-but-empty spreadsheet columns) must never
 * be mapped, turned into a field, or sent with the import.
 */
export function dropEmptyColumns(parsed: ParsedCsv): CsvWithoutEmptyColumns {
    const keep: number[] = [];
    const skippedColumns: string[] = [];

    parsed.headers.forEach((header, idx) => {
        const hasValue = parsed.rows.some((row) => (row[idx] ?? "").trim() !== "");
        if (hasValue) {
            keep.push(idx);
        } else {
            skippedColumns.push(header.trim() || `Column ${idx + 1}`);
        }
    });

    // Cells beyond the header row (ragged rows) are kept only if they belong to a kept column.
    return {
        headers: keep.map((idx) => parsed.headers[idx]),
        rows: parsed.rows.map((row) => keep.map((idx) => row[idx] ?? "")),
        skippedColumns,
    };
}

function escapeCsvValue(value: string): string {
    if (/[",\r\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

export function toCsvContent(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
    const lines = [headers.map(escapeCsvValue).join(",")];
    for (const row of rows) {
        lines.push(row.map((value) => escapeCsvValue(value === null || value === undefined ? "" : String(value))).join(","));
    }
    return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function downloadCsvFile(filename: string, content: string): void {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
    }, 500);
}
