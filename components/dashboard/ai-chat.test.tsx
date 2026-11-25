import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "sonner";

import { AIChat } from "@/components/dashboard/ai-chat";

function findVoiceInput(): HTMLInputElement {
    return document.querySelector('input[type="file"][accept*=".m4a"]') as HTMLInputElement;
}

function fakeAudioBuffer(sampleRate: number, length: number): AudioBuffer {
    const data = new Float32Array(length).fill(0.25);
    return {
        numberOfChannels: 1,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: () => data,
    } as unknown as AudioBuffer;
}

function stubAudioContext(decode: () => Promise<AudioBuffer>) {
    class FakeAudioContext {
        decodeAudioData = vi.fn(decode);
        close = vi.fn(() => Promise.resolve());
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
}

const {
    initializeMock,
    sendMessageMock,
    queueWeeklyReportMock,
    downloadWeeklyReportMock,
    runVoiceTranscriptionMock,
    runFileAnalysisMock,
    runTranscriptSummaryMock,
    loadForecastOverviewMock,
    searchAssigneesMock,
    useCopilotChatMock,
} = vi.hoisted(() => ({
    initializeMock: vi.fn(),
    sendMessageMock: vi.fn(),
    queueWeeklyReportMock: vi.fn(),
    downloadWeeklyReportMock: vi.fn(),
    runVoiceTranscriptionMock: vi.fn(),
    runFileAnalysisMock: vi.fn(),
    runTranscriptSummaryMock: vi.fn(),
    loadForecastOverviewMock: vi.fn(),
    searchAssigneesMock: vi.fn(),
    useCopilotChatMock: vi.fn(),
}));

vi.mock("next/image", () => ({
    default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

vi.mock("@/hooks/use-copilot-chat", () => ({
    useCopilotChat: () => useCopilotChatMock(),
}));

vi.mock("@/hooks/use-crm", () => ({
    useCrmLabels: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/hooks/use-internal-users", () => ({
    useCompanyZones: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("@/components/zones/create-zone-modal", () => ({
    CreateZoneModal: () => null,
}));

vi.mock("@/components/map/PlaceAutocompleteField", () => ({
    PlaceAutocompleteField: ({
        value,
        onChange,
        placeholder,
    }: {
        value: string;
        onChange: (value: string) => void;
        placeholder?: string;
    }) => (
        <input
            aria-label={placeholder ?? "Place"}
            value={value}
            onChange={(event) => onChange(event.target.value)}
        />
    ),
}));

vi.mock("@/store/auth", () => ({
    useAuthStore: vi.fn((selector: (state: { user: unknown }) => unknown) =>
        selector({
            user: {
                id: 12,
                name: "Ada Test",
                avatar: null,
                active_company: { company_id: 99 },
            },
        })
    ),
}));

vi.mock("@/lib/company-context", () => ({
    getActiveCompanyContext: vi.fn(() => ({
        apiCompanyId: 99,
        role: "admin",
    })),
}));

describe("AIChat", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
        Element.prototype.scrollIntoView = vi.fn();
        searchAssigneesMock.mockResolvedValue([
            { id: 42, name: "John Wick", email: "john.wick@example.com", role: "agent" },
            { id: 7, name: "Ada Test", email: "ada@example.com", role: "admin" },
        ]);

        useCopilotChatMock.mockReturnValue({
            messages: [
                {
                    id: "a1",
                    role: "assistant",
                    content: "Use this source-aware answer.",
                    sources: ["tasks.overdue"],
                },
            ],
            isStreaming: false,
            weeklyReport: null,
            isQueueingWeeklyReport: false,
            initialize: initializeMock,
            sendMessage: sendMessageMock,
            queueWeeklyReport: queueWeeklyReportMock,
            downloadWeeklyReport: downloadWeeklyReportMock,
            runVoiceTranscription: runVoiceTranscriptionMock,
            runFileAnalysis: runFileAnalysisMock,
            runTranscriptSummary: runTranscriptSummaryMock,
            loadForecastOverview: loadForecastOverviewMock,
            searchAssignees: searchAssigneesMock,
        });
    });

    it("initializes chat and renders assistant source chips", async () => {
        render(<AIChat open onClose={() => { }} />);

        await waitFor(() => {
            expect(initializeMock).toHaveBeenCalledWith(99);
        });

        expect(screen.getByText("Use this source-aware answer.")).toBeTruthy();
        expect(screen.getByText("tasks.overdue")).toBeTruthy();
    });

    it("sends input content through copilot hook", async () => {
        render(<AIChat open onClose={() => { }} />);

        const input = screen.getByPlaceholderText("Ask ELY anything...");
        fireEvent.change(input, { target: { value: "What is overdue?" } });
        fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

        await waitFor(() => {
            expect(sendMessageMock).toHaveBeenCalledWith({
                message: "What is overdue?",
                companyId: 99,
            });
        });
    });

    it("confirms action requests using assistant payload", async () => {
        useCopilotChatMock.mockReturnValue({
            messages: [
                {
                    id: "u1",
                    role: "user",
                    content: "Create task for dispatch checks",
                    sources: [],
                },
                {
                    id: "a2",
                    role: "assistant",
                    content: "This action requires explicit confirmation.",
                    sources: ["tasks.create"],
                    payload: {
                        confirmation_required: true,
                        action_args: {
                            title: "Dispatch checks",
                            type: "inspection",
                            description: "Run dispatch checks at the operations yard.",
                            location: "Ops Yard",
                            address: "Ops Yard",
                            due_date: "2026-07-20T17:00:00.000Z",
                            draft_id: "draft-1",
                            draft_version: 1,
                        },
                    },
                },
            ],
            isStreaming: false,
            weeklyReport: null,
            isQueueingWeeklyReport: false,
            initialize: initializeMock,
            sendMessage: sendMessageMock,
            queueWeeklyReport: queueWeeklyReportMock,
            downloadWeeklyReport: downloadWeeklyReportMock,
            runVoiceTranscription: runVoiceTranscriptionMock,
            runFileAnalysis: runFileAnalysisMock,
            runTranscriptSummary: runTranscriptSummaryMock,
            loadForecastOverview: loadForecastOverviewMock,
            searchAssignees: searchAssigneesMock,
        });

        render(<AIChat open onClose={() => { }} />);

        await waitFor(() => {
            expect(screen.getByDisplayValue("Dispatch checks")).toBeTruthy();
            expect(screen.getAllByDisplayValue("Ops Yard").length).toBeGreaterThan(0);
        });

        fireEvent.click(screen.getByText("Confirm Action"));

        await waitFor(() => {
            expect(sendMessageMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: "Create task for dispatch checks",
                    companyId: 99,
                    actionConfirmed: true,
                    actionArgs: expect.objectContaining({
                        title: "Dispatch checks",
                        location: "Ops Yard",
                        address: "Ops Yard",
                        draft_id: "draft-1",
                        draft_version: 1,
                    }),
                }),
            );
        });
    });

    it("renders full task editor with prefilled location for tasks.create", async () => {
        useCopilotChatMock.mockReturnValue({
            messages: [
                {
                    id: "u-task",
                    role: "user",
                    content: "Create a task to visit a client at Lekki Phase II and assign Taraji Henson to it",
                    sources: [],
                },
                {
                    id: "a-task",
                    role: "assistant",
                    content: "Review this task before confirming.",
                    sources: ["tasks.create"],
                    payload: {
                        confirmation_required: true,
                        blocking_confirmation: true,
                        blocking_warning_codes: ["assignee_unresolved"],
                        validation_warning_codes: ["assignee_unresolved"],
                        action_args: {
                            title: "Visit client",
                            type: "sales_visit",
                            description: "Complete the assigned visit to a client at Lekki Phase II.",
                            location: "Lekki Phase II",
                            address: "Lekki Phase II",
                            due_date: "2026-07-20T17:00:00.000Z",
                            draft_id: "draft-lekki",
                            draft_version: 2,
                        },
                    },
                },
            ],
            isStreaming: false,
            weeklyReport: null,
            isQueueingWeeklyReport: false,
            initialize: initializeMock,
            sendMessage: sendMessageMock,
            queueWeeklyReport: queueWeeklyReportMock,
            downloadWeeklyReport: downloadWeeklyReportMock,
            runVoiceTranscription: runVoiceTranscriptionMock,
            runFileAnalysis: runFileAnalysisMock,
            runTranscriptSummary: runTranscriptSummaryMock,
            loadForecastOverview: loadForecastOverviewMock,
            searchAssignees: searchAssigneesMock,
        });

        render(<AIChat open onClose={() => { }} />);

        await waitFor(() => {
            expect(screen.getByDisplayValue("Visit client")).toBeTruthy();
            expect(screen.getAllByDisplayValue("Lekki Phase II").length).toBeGreaterThan(0);
            expect(screen.getAllByText("Location").length).toBeGreaterThan(0);
            expect(screen.getByText("Priority")).toBeTruthy();
            expect(screen.getByText("Confirm Action").closest("button")?.disabled).toBe(true);
        });
    });

    it("renders KPI assignee as a user select instead of a numeric id input", async () => {
        useCopilotChatMock.mockReturnValue({
            messages: [
                {
                    id: "u-kpi",
                    role: "user",
                    content: "Create KPI for retailer visits and assign to John Wick",
                    sources: [],
                },
                {
                    id: "a-kpi",
                    role: "assistant",
                    content: "Review this KPI before confirming.",
                    sources: ["kpis.create"],
                    payload: {
                        confirmation_required: true,
                        action_args: {
                            name: "Retailer Visits",
                            category: "customer_visits",
                            objective: "Increase qualified retailer visits across the assigned territory.",
                            target_value: "50 visits",
                            expected_outcome: "Reach 50 qualified retailer visits within the KPI period.",
                            priority: "high",
                            start_date: "2026-06-01",
                            end_date: "2026-06-30",
                            assigned_to_user_id: 42,
                        },
                    },
                },
            ],
            isStreaming: false,
            weeklyReport: null,
            isQueueingWeeklyReport: false,
            initialize: initializeMock,
            sendMessage: sendMessageMock,
            queueWeeklyReport: queueWeeklyReportMock,
            downloadWeeklyReport: downloadWeeklyReportMock,
            runVoiceTranscription: runVoiceTranscriptionMock,
            runFileAnalysis: runFileAnalysisMock,
            runTranscriptSummary: runTranscriptSummaryMock,
            loadForecastOverview: loadForecastOverviewMock,
            searchAssignees: searchAssigneesMock,
        });

        render(<AIChat open onClose={() => { }} />);

        await waitFor(() => {
            expect(searchAssigneesMock).toHaveBeenCalled();
            expect(screen.getByRole("option", { name: "John Wick" })).toBeTruthy();
        });

        const assignFieldLabel = screen.getByText("Assign To");
        const assignSelect = assignFieldLabel.parentElement?.querySelector("select");
        expect(assignSelect).toBeTruthy();
        expect(assignSelect?.tagName).toBe("SELECT");
        expect(screen.queryByText("Assigned To User Id")).toBeNull();
    });

    it("confirms notifications.send with user_ids as an integer array", async () => {
        useCopilotChatMock.mockReturnValue({
            messages: [
                {
                    id: "u-remind",
                    role: "user",
                    content: "Send a reminder to these agents",
                    sources: [],
                },
                {
                    id: "a-remind",
                    role: "assistant",
                    content: "Review this reminder before confirming.",
                    sources: ["notifications.send"],
                    payload: {
                        confirmation_required: true,
                        action_args: {
                            title: "Overdue task reminder",
                            message: "You have overdue tasks assigned: John Wick — \"test the task stuff\".",
                            user_ids: [38, 39],
                            recipient_names: ["John Wick", "Taraji Henson"],
                            delivery_types: ["in_app", "push", "email"],
                            category: "task",
                            priority: "high",
                        },
                    },
                },
            ],
            isStreaming: false,
            weeklyReport: null,
            isQueueingWeeklyReport: false,
            initialize: initializeMock,
            sendMessage: sendMessageMock,
            queueWeeklyReport: queueWeeklyReportMock,
            downloadWeeklyReport: downloadWeeklyReportMock,
            runVoiceTranscription: runVoiceTranscriptionMock,
            runFileAnalysis: runFileAnalysisMock,
            runTranscriptSummary: runTranscriptSummaryMock,
            loadForecastOverview: loadForecastOverviewMock,
            searchAssignees: searchAssigneesMock,
        });

        render(<AIChat open onClose={() => { }} />);

        await waitFor(() => {
            expect(searchAssigneesMock).toHaveBeenCalled();
            expect(screen.getByText("John Wick, Taraji Henson")).toBeTruthy();
        });

        expect(screen.queryByText("User Ids")).toBeNull();

        fireEvent.click(screen.getByText("Confirm Action"));

        await waitFor(() => {
            expect(sendMessageMock).toHaveBeenCalledWith({
                message: "Send a reminder to these agents",
                companyId: 99,
                actionConfirmed: true,
                actionArgs: {
                    title: "Overdue task reminder",
                    message: 'You have overdue tasks assigned: John Wick — "test the task stuff".',
                    user_ids: [38, 39],
                    delivery_types: ["in_app", "push", "email"],
                    category: "task",
                    priority: "high",
                },
            });
        });
    });

    it("queues weekly summary from quick action button", async () => {
        useCopilotChatMock.mockReturnValue({
            messages: [],
            isStreaming: false,
            weeklyReport: null,
            isQueueingWeeklyReport: false,
            initialize: initializeMock,
            sendMessage: sendMessageMock,
            queueWeeklyReport: queueWeeklyReportMock,
            downloadWeeklyReport: downloadWeeklyReportMock,
            runVoiceTranscription: runVoiceTranscriptionMock,
            runFileAnalysis: runFileAnalysisMock,
            runTranscriptSummary: runTranscriptSummaryMock,
            loadForecastOverview: loadForecastOverviewMock,
        });

        render(<AIChat open onClose={() => { }} />);

        fireEvent.click(screen.getByRole("button", { name: "Generate Weekly Summary" }));

        await waitFor(() => {
            expect(queueWeeklyReportMock).toHaveBeenCalledWith(99);
        });
    });

    it("opens transcript summary modal and submits transcript", async () => {
        runTranscriptSummaryMock.mockResolvedValue({
            summary: {
                key_points: ["Point 1", "Point 2", "Point 3"],
                action_items: ["Action 1", "Action 2"],
            },
        });

        render(<AIChat open onClose={() => { }} />);

        // Open menu, then AI Tools, then click Summarize Transcript
        fireEvent.click(screen.getByLabelText("More options"));
        fireEvent.click(await screen.findByText("AI Tools"));
        fireEvent.click(await screen.findByText("Summarize Transcript"));

        // Find and fill the textarea
        const textarea = await screen.findByPlaceholderText(/paste your meeting transcript/i);
        expect(textarea).toBeTruthy();

        fireEvent.change(textarea, { target: { value: "This is a test meeting transcript with content about the quarterly review." } });

        // Click Summarize button
        const summarizeBtn = screen.getAllByText(/Summarize/i).find(btn => btn.tagName === "BUTTON");
        if (summarizeBtn) {
            fireEvent.click(summarizeBtn);
        }

        await waitFor(() => {
            expect(runTranscriptSummaryMock).toHaveBeenCalledWith("This is a test meeting transcript with content about the quarterly review.", 99);
            expect(sendMessageMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining("Transcript Summary"),
                })
            );
        });
    });

    it("opens voice modal with loading state and sends transcript with instruction", async () => {
        let resolveVoice: (value: { transcript: string }) => void = () => { };
        runVoiceTranscriptionMock.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveVoice = resolve;
                })
        );

        stubAudioContext(async () => fakeAudioBuffer(48000, 48000));
        render(<AIChat open onClose={() => { }} />);

        const voiceInput = findVoiceInput();
        expect(voiceInput).toBeTruthy();

        const audioFile = new File(["audio-bytes"], "field-update.m4a", { type: "audio/mp4" });
        fireEvent.change(voiceInput, { target: { files: [audioFile] } });

        expect(await screen.findByText("Processing Voice Note…")).toBeTruthy();
        expect(screen.getByText("Processing voice note…")).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Send to Chat/i })).toBeNull();

        resolveVoice({ transcript: "Please schedule the warehouse walkthrough for Friday morning." });

        expect(await screen.findByText("Voice Note Ready")).toBeTruthy();
        expect(
            screen.getByText("Please schedule the warehouse walkthrough for Friday morning.")
        ).toBeTruthy();

        const instructionField = screen.getByPlaceholderText(/summarize the key points/i);
        fireEvent.change(instructionField, {
            target: { value: "Turn this into a task list with owners and due dates." },
        });

        fireEvent.click(screen.getByRole("button", { name: /Send to Chat/i }));

        await waitFor(() => {
            expect(runVoiceTranscriptionMock).toHaveBeenCalled();
            expect(sendMessageMock).toHaveBeenCalledWith({
                message:
                    "Turn this into a task list with owners and due dates.\n\nVoice note transcript:\nPlease schedule the warehouse walkthrough for Friday morning.",
                companyId: 99,
            });
        });
    });

    it("closes voice modal and shows error when transcription fails", async () => {
        runVoiceTranscriptionMock.mockRejectedValue(new Error("Transcription service unavailable"));

        render(<AIChat open onClose={() => { }} />);

        const voiceInput = findVoiceInput();
        const audioFile = new File(["audio-bytes"], "note.wav", { type: "audio/wav" });
        fireEvent.change(voiceInput, { target: { files: [audioFile] } });

        expect(await screen.findByText("Processing Voice Note…")).toBeTruthy();

        await waitFor(() => {
            expect(screen.queryByText("Processing Voice Note…")).toBeNull();
            expect(runVoiceTranscriptionMock).toHaveBeenCalled();
        });
    });

    it("opens forecast modal with loading state and sends forecast with instruction", async () => {
        let resolveForecast: (value: Record<string, unknown>) => void = () => { };
        loadForecastOverviewMock.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveForecast = resolve;
                })
        );

        useCopilotChatMock.mockReturnValue({
            messages: [],
            isStreaming: false,
            weeklyReport: null,
            isQueueingWeeklyReport: false,
            initialize: initializeMock,
            sendMessage: sendMessageMock,
            queueWeeklyReport: queueWeeklyReportMock,
            downloadWeeklyReport: downloadWeeklyReportMock,
            runVoiceTranscription: runVoiceTranscriptionMock,
            runFileAnalysis: runFileAnalysisMock,
            runTranscriptSummary: runTranscriptSummaryMock,
            loadForecastOverview: loadForecastOverviewMock,
        });

        render(<AIChat open onClose={() => { }} />);

        fireEvent.click(screen.getByRole("button", { name: /Forecast$/i }));

        expect(await screen.findByText("Building Forecast…")).toBeTruthy();
        expect(screen.getByText("Gathering KPIs…")).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Send to Chat/i })).toBeNull();

        resolveForecast({
            company_id: 99,
            pipeline: "forecast.recommendations.v2",
            snapshot: {
                kpis: { total_tasks: 12, completed_tasks: 5 },
                signals: { overdue_tasks: 1 },
                trends: { activity_score_change: 8, activity_direction: "up" },
            },
            forecast: {
                outlook: "next_7_days",
                horizon_days: 7,
                confidence: 0.7,
                risk_level: "medium",
                recommendations: ["Clear overdue tasks this week."],
                structured_recommendations: [
                    { priority: "high", area: "tasks", text: "Clear overdue tasks this week." },
                ],
                narrative: "Focus on overdue recovery and payroll approvals.",
                generated_at: "2026-06-24T10:00:00.000Z",
                trace_id: "trace-99",
            },
        });

        expect(await screen.findByText("Next 7 days Forecast")).toBeTruthy();
        expect(await screen.findByText(/Clear overdue tasks this week\./)).toBeTruthy();
        expect(screen.getByText("Focus on overdue recovery and payroll approvals.")).toBeTruthy();

        const instructionField = screen.getByPlaceholderText(/turn the highest-risk items/i);
        fireEvent.change(instructionField, {
            target: { value: "Turn this into an action plan for my leadership team." },
        });

        fireEvent.click(screen.getByRole("button", { name: /Send to Chat/i }));

        await waitFor(() => {
            expect(loadForecastOverviewMock).toHaveBeenCalledWith(99, 7);
            expect(sendMessageMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    companyId: 99,
                    message: expect.stringContaining("Turn this into an action plan for my leadership team."),
                })
            );
        });
    });

    it("closes forecast modal when loading fails", async () => {
        loadForecastOverviewMock.mockRejectedValue(new Error("Forecast service unavailable"));

        useCopilotChatMock.mockReturnValue({
            messages: [],
            isStreaming: false,
            weeklyReport: null,
            isQueueingWeeklyReport: false,
            initialize: initializeMock,
            sendMessage: sendMessageMock,
            queueWeeklyReport: queueWeeklyReportMock,
            downloadWeeklyReport: downloadWeeklyReportMock,
            runVoiceTranscription: runVoiceTranscriptionMock,
            runFileAnalysis: runFileAnalysisMock,
            runTranscriptSummary: runTranscriptSummaryMock,
            loadForecastOverview: loadForecastOverviewMock,
        });

        render(<AIChat open onClose={() => { }} />);

        fireEvent.click(screen.getByRole("button", { name: /Forecast$/i }));

        expect(await screen.findByText("Building Forecast…")).toBeTruthy();

        await waitFor(() => {
            expect(screen.queryByText("Building Forecast…")).toBeNull();
            expect(loadForecastOverviewMock).toHaveBeenCalledWith(99, 7);
        });
    });
    describe("chats menu, clear, and quick-action fixes", () => {
        const refreshThreadsMock = vi.fn();
        const loadThreadMock = vi.fn();
        const startNewChatMock = vi.fn();
        const clearCurrentThreadMock = vi.fn();

        function mockHook(overrides: Record<string, unknown> = {}) {
            useCopilotChatMock.mockReturnValue({
                messages: [],
                isStreaming: false,
                weeklyReport: null,
                isQueueingWeeklyReport: false,
                initialize: initializeMock,
                loadThread: loadThreadMock,
                threadId: "thread-2",
                threads: [
                    { thread_id: "thread-2", updated_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), created_at: "2026-01-02T00:00:00.000Z", message_count: 4, last_message_preview: "preview two", title: "Fleet check" },
                    { thread_id: "thread-1", updated_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z", message_count: 2, last_message_preview: "Show overdue tasks" },
                ],
                refreshThreads: refreshThreadsMock,
                startNewChat: startNewChatMock,
                clearCurrentThread: clearCurrentThreadMock,
                sendMessage: sendMessageMock,
                queueWeeklyReport: queueWeeklyReportMock,
                downloadWeeklyReport: downloadWeeklyReportMock,
                runVoiceTranscription: runVoiceTranscriptionMock,
                runFileAnalysis: runFileAnalysisMock,
                runTranscriptSummary: runTranscriptSummaryMock,
                loadForecastOverview: loadForecastOverviewMock,
                searchAssignees: searchAssigneesMock,
                ...overrides,
            });
        }

        beforeEach(() => {
            refreshThreadsMock.mockReset().mockResolvedValue([]);
            loadThreadMock.mockReset().mockResolvedValue(undefined);
            startNewChatMock.mockReset();
            clearCurrentThreadMock.mockReset().mockResolvedValue(undefined);
            mockHook();
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        async function openChats() {
            fireEvent.click(screen.getByLabelText("More options"));
            fireEvent.click(await screen.findByText("Chats"));
        }

        it("lists recent chats when the Chats section opens and ticks the current one", async () => {
            render(<AIChat open onClose={() => { }} />);
            await openChats();

            expect(refreshThreadsMock).toHaveBeenCalledWith(99);
            expect(screen.getByText("New chat")).toBeTruthy();
            const current = screen.getByText("Fleet check").closest("button");
            expect(current?.getAttribute("aria-current")).toBe("true");
            expect(screen.getByText("2h ago")).toBeTruthy();
            // Falls back to the last message preview without a title.
            const other = screen.getByText("Show overdue tasks").closest("button");
            expect(other?.getAttribute("aria-current")).toBeNull();
        });

        it("switches to another chat", async () => {
            render(<AIChat open onClose={() => { }} />);
            await openChats();

            fireEvent.click(screen.getByText("Show overdue tasks"));

            await waitFor(() => expect(loadThreadMock).toHaveBeenCalledWith("thread-1", 99));
            // Menu closes after picking a chat.
            expect(screen.queryByText("New chat")).toBeNull();
        });

        it("starts a new chat from the menu", async () => {
            render(<AIChat open onClose={() => { }} />);
            await openChats();

            fireEvent.click(screen.getByText("New chat"));

            expect(startNewChatMock).toHaveBeenCalledTimes(1);
            expect(loadThreadMock).not.toHaveBeenCalled();
        });

        it("shows an empty new chat after Clear Chat instead of loading an older one", async () => {
            render(<AIChat open onClose={() => { }} />);
            await waitFor(() => expect(initializeMock).toHaveBeenCalledTimes(1));

            fireEvent.click(screen.getByLabelText("More options"));
            fireEvent.click(await screen.findByText("Clear Chat"));
            const confirm = (await screen.findAllByRole("button", { name: "Clear Chat" })).at(-1)!;
            fireEvent.click(confirm);

            await waitFor(() => expect(clearCurrentThreadMock).toHaveBeenCalledWith(99));
            await waitFor(() => expect(startNewChatMock).toHaveBeenCalledTimes(1));
            expect(initializeMock).toHaveBeenCalledTimes(1);
        });

        it("converts a non-WAV/MP3 voice upload to 16 kHz WAV before transcribing", async () => {
            stubAudioContext(async () => fakeAudioBuffer(44100, 44100));
            runVoiceTranscriptionMock.mockResolvedValue({ transcript: "hello" });
            render(<AIChat open onClose={() => { }} />);

            const voiceInput = findVoiceInput();
            expect(voiceInput.getAttribute("accept")).not.toContain("audio/*");
            fireEvent.change(voiceInput, { target: { files: [new File(["ogg"], "memo.ogg", { type: "audio/ogg" })] } });

            await waitFor(() => expect(runVoiceTranscriptionMock).toHaveBeenCalled());
            const uploaded = runVoiceTranscriptionMock.mock.calls[0][0] as File;
            expect(uploaded.name).toBe("memo.wav");
            expect(uploaded.type).toBe("audio/wav");
            expect(uploaded.size).toBe(44 + 16000 * 2);
        });

        it("uploads MP3 as is", async () => {
            runVoiceTranscriptionMock.mockResolvedValue({ transcript: "hello" });
            render(<AIChat open onClose={() => { }} />);

            const mp3 = new File(["mp3"], "memo.mp3", { type: "audio/mpeg" });
            fireEvent.change(findVoiceInput(), { target: { files: [mp3] } });

            await waitFor(() => expect(runVoiceTranscriptionMock).toHaveBeenCalledWith(mp3, 99));
        });

        it("tells the user when an audio file cannot be decoded", async () => {
            const errorSpy = vi.spyOn(toast, "error");
            stubAudioContext(async () => { throw new Error("EncodingError"); });
            render(<AIChat open onClose={() => { }} />);

            fireEvent.change(findVoiceInput(), { target: { files: [new File(["?"], "memo.webm", { type: "audio/webm" })] } });

            await waitFor(() =>
                expect(errorSpy).toHaveBeenCalledWith("This audio format isn't supported. Record in the chat or upload WAV/MP3.")
            );
            expect(runVoiceTranscriptionMock).not.toHaveBeenCalled();
            errorSpy.mockRestore();
        });

        it("uses provider_summary as the transcript summary text when present", async () => {
            runTranscriptSummaryMock.mockResolvedValue({
                summary: {
                    key_points: ["Point 1"],
                    action_items: ["Action 1"],
                    provider_summary: "The team agreed to ship on Friday.",
                },
            });
            // With a message on screen the landing quick actions are hidden.
            mockHook({ messages: [{ id: "a1", role: "assistant", content: "Hi", sources: [] }] });
            render(<AIChat open onClose={() => { }} />);

            fireEvent.click(screen.getByLabelText("More options"));
            fireEvent.click(await screen.findByText("AI Tools"));
            fireEvent.click(await screen.findByText("Summarize Transcript"));
            const textarea = await screen.findByPlaceholderText(/paste your meeting transcript/i);
            fireEvent.change(textarea, { target: { value: "A long enough meeting transcript about the release plan." } });
            const summarizeBtn = screen.getAllByText(/Summarize/i).find((btn) => btn.tagName === "BUTTON");
            fireEvent.click(summarizeBtn!);

            await waitFor(() =>
                expect(sendMessageMock).toHaveBeenCalledWith({
                    message: "Transcript Summary\n\nThe team agreed to ship on Friday.",
                    companyId: 99,
                })
            );
        });

        it("does not offer .xls in the Analyze File picker", () => {
            render(<AIChat open onClose={() => { }} />);
            const accepts = Array.from(document.querySelectorAll('input[type="file"]')).map((el) => el.getAttribute("accept") ?? "");
            const analyze = accepts.find((value) => value.includes(".xlsx"));
            expect(analyze).toBeTruthy();
            expect(analyze!.split(",")).not.toContain(".xls");
        });
    });
});
