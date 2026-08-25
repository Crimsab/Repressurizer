import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/tauri", () => ({ loadAppData: vi.fn(async () => null), saveAppData: vi.fn(async () => undefined) }));
vi.mock("./entityJournalStore", () => ({ useEntityJournalStore: { getState: () => ({ append: vi.fn() }) } }));
import { useSessionPlannerStore } from "./sessionPlannerStore";
import { DEFAULT_SESSION_PLANNER_CONFIG } from "../lib/sessionPlanner";

describe("sessionPlannerStore", () => {
  beforeEach(() => useSessionPlannerStore.setState({ config: { ...DEFAULT_SESSION_PLANNER_CONFIG }, presets: [], hiddenUntil: {}, permanentlySuppressed: [], frequency: {}, pinnedAppId: null, history: [], queue: [], recentQueues: [], hydrated: true }));
  it("keeps queue app ids unique and supports ordering and durations", () => {
    expect(useSessionPlannerStore.getState().addToQueue(1, 20)).toBe(true);
    expect(useSessionPlannerStore.getState().addToQueue(1, 60)).toBe(false);
    useSessionPlannerStore.getState().addToQueue(2, 30);
    useSessionPlannerStore.getState().moveQueueItem(2, -1);
    useSessionPlannerStore.getState().setQueueDuration(2, 45);
    expect(useSessionPlannerStore.getState().queue.map((item) => [item.appId, item.durationMinutes])).toEqual([[2, 45], [1, 20]]);
  });
  it("archives and resumes a queue without deleting it at day boundaries", () => {
    useSessionPlannerStore.getState().addToQueue(1, 20);
    const id = useSessionPlannerStore.getState().saveCurrentQueue("Tonight")!;
    useSessionPlannerStore.getState().clearQueue();
    useSessionPlannerStore.getState().resumeQueue(id);
    expect(useSessionPlannerStore.getState().queue).toHaveLength(1);
  });
});
