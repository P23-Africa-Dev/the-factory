/**
 * Tells ELY which page the user is on, so "this lead" or "add a note here"
 * refers to the record on screen. Only the path and a record id are sent.
 */
export type ElyPageEntityType = "lead" | "task" | "project";

export type ElyPageContext = {
    path: string;
    entity_type?: ElyPageEntityType;
    entity_id?: number;
};

const ENTITY_ROUTES: Array<{ pattern: RegExp; type: ElyPageEntityType }> = [
    { pattern: /^\/(?:agent\/)?crm\/leads\/(\d+)(?:\/|$)/, type: "lead" },
    { pattern: /^\/(?:agent\/)?projects\/(\d+)(?:\/|$)/, type: "project" },
    { pattern: /^\/(?:agent\/)?operations\/(\d+)(?:\/|$)/, type: "project" },
    { pattern: /^\/agent\/tasks\/(\d+)(?:\/|$)/, type: "task" },
];

export function elyPageContextFromPath(pathname: string | null | undefined): ElyPageContext | undefined {
    if (!pathname) return undefined;

    const path = pathname.split("?")[0]?.split("#")[0] ?? "";
    if (!path) return undefined;

    for (const { pattern, type } of ENTITY_ROUTES) {
        const match = pattern.exec(path);
        if (match) {
            const id = Number(match[1]);
            if (Number.isInteger(id) && id > 0) {
                return { path, entity_type: type, entity_id: id };
            }
        }
    }

    return { path };
}
