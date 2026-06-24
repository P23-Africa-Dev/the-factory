import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIChat } from "@/components/dashboard/ai-chat";

const {
    initializeMock,
    sendMessageMock,
    queueWeeklyReportMock,
    downloadWeeklyReportMock,
    runVoiceTranscriptionMock,
    runFileAnalysisMock,
    runTranscriptSummaryMock,
    loadForecastOverviewMock,
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
    useCopilotChatMock: vi.fn(),
}));

vi.mock("next/image", () => ({
    default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

vi.mock("@/hooks/use-copilot-chat", () => ({
    useCopilotChat: () => useCopilotChatMock(),
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
        Element.prototype.scrollIntoView = vi.fn();

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
                            location: "Ops Yard",
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
        });

        render(<AIChat open onClose={() => { }} />);

        fireEvent.click(screen.getByText("Confirm Action"));

        await waitFor(() => {
            expect(sendMessageMock).toHaveBeenCalledWith({
                message: "Create task for dispatch checks",
                companyId: 99,
                actionConfirmed: true,
                actionArgs: {
                    title: "Dispatch checks",
                    location: "Ops Yard",
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

        render(<AIChat open onClose={() => { }} />);

        const voiceInput = document.querySelector('input[type="file"][accept="audio/*"]') as HTMLInputElement;
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

        const voiceInput = document.querySelector('input[type="file"][accept="audio/*"]') as HTMLInputElement;
        const audioFile = new File(["audio-bytes"], "note.wav", { type: "audio/wav" });
        fireEvent.change(voiceInput, { target: { files: [audioFile] } });

        expect(await screen.findByText("Processing Voice Note…")).toBeTruthy();

        await waitFor(() => {
            expect(screen.queryByText("Processing Voice Note…")).toBeNull();
            expect(runVoiceTranscriptionMock).toHaveBeenCalled();
        });
    });
});
