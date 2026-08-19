import { create } from "zustand";
import { loadAppData, saveAppData, createDiaryBackup } from "../lib/tauri";
import type { DiaryTemplate } from "../lib/diaryTemplates";

export type DiaryDecision = "backlog" | "next" | "deferred" | "archived";
export type DiaryPriority = "low" | "normal" | "high";
export type DiaryPageScope = "all" | "selected";

/** A user-created Kanban column, independent from diary statuses. */
export interface DiaryCustomColumn {
  id: string;
  name: string;
  color: string;
}

/** Kanban board customization: colors, hidden columns, custom columns and assignments. */
export interface DiaryBoardPrefs {
  columnColors: Record<string, string>;
  hiddenColumns: string[];
  customColumns: DiaryCustomColumn[];
  /** appId -> custom column id (wins over the diary status on the board). */
  customAssignments: Record<string, string>;
}

export interface DiaryEntry {
  decision: DiaryDecision;
  priority: DiaryPriority;
  updatedAt: number;
  /** Explicit "to play" placement that survives a non-zero playtime. */
  markedBacklog?: boolean;
}

/** A recorded diary status transition, used by the Timeline view. */
export interface DiaryStatusEvent {
  id: string;
  appId: number;
  status: string;
  at: number;
}

/** A slim unlocked achievement kept for the Timeline (no descriptions, no locked entries). */
export interface DiaryAchievementEntry {
  apiName: string;
  name: string;
  unlockedAt: number;
  icon: string | null;
}

export interface DiaryFinishPromptState {
  promptedAtMinutes: number;
  dismissed: boolean;
}

export interface DiaryJournalEntry {
  id: string;
  body: string;
  createdAt: number;
  playedMinutes: number;
  updatedAt?: number;
}

/** A user-authored Markdown page. Empty appIds means the page is global. */
export interface DiarySection {
  id: string;
  title: string;
  markdown: string;
  scope: DiaryPageScope;
  appIds: number[];
  createdAt: number;
  updatedAt: number;
}

export interface DiaryRevision {
  id: string;
  target: "overview" | "page";
  targetId: string;
  appId?: number;
  title?: string;
  markdown: string;
  createdAt: number;
}

interface PersistedDiary {
  entries?: Record<string, DiaryEntry>;
  queue?: number[];
  finishPrompts?: Record<string, DiaryFinishPromptState>;
  journal?: Record<string, DiaryJournalEntry[]>;
  pages?: DiarySection[];
  revisions?: DiaryRevision[];
  /** Manual Kanban ordering: appid → rank within its column. */
  board?: Record<string, number>;
  /** Pre-page-scope format kept as a migration source. */
  sections?: Record<string, DiarySection[]>;
}

interface DiaryState {
  entries: Record<number, DiaryEntry>;
  queue: number[];
  finishPrompts: Record<number, DiaryFinishPromptState>;
  journal: Record<number, DiaryJournalEntry[]>;
  pages: DiarySection[];
  revisions: DiaryRevision[];
  board: Record<number, number>;
  statusEvents: DiaryStatusEvent[];
  achievements: Record<number, DiaryAchievementEntry[]>;
  achievementsSyncedAt: Record<number, number>;
  boardPrefs: DiaryBoardPrefs;
  templates: DiaryTemplate[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Replaces the cached unlock list for one game (also stamps the sync time). */
  setAchievements: (appId: number, entries: DiaryAchievementEntry[]) => void;
  /** Overrides the Kanban column color for a status; null restores the default. */
  setColumnColor: (status: string, color: string | null) => void;
  /** Shows or hides a Kanban column. */
  toggleColumnHidden: (status: string) => void;
  /** Creates a custom Kanban column and returns its id. */
  addCustomColumn: (name: string, color: string) => string | null;
  renameCustomColumn: (columnId: string, name: string) => void;
  removeCustomColumn: (columnId: string) => void;
  /** Moves a game onto a custom column, or back to status-driven columns when null. */
  setCustomAssignment: (appId: number, columnId: string | null) => void;
  setDecision: (appId: number, decision: DiaryDecision) => void;
  setPriority: (appId: number, priority: DiaryPriority) => void;
  setMarkedBacklog: (appId: number, marked: boolean) => void;
  /** Appends a status transition to the diary event log (dedupes repeats). */
  logStatusEvent: (appId: number, status: string) => void;
  /** Persists the manual order of one Kanban column: ranks are the array index. */
  setBoardOrder: (orderedAppIds: number[]) => void;
  removeFromQueue: (appId: number) => void;
  setQueue: (queue: number[]) => void;
  markFinishPromptSeen: (appId: number, playtimeMinutes: number) => void;
  /** Marks a whole batch of prompts as seen without dismissing them. */
  markAllFinishPromptsSeen: (entries: Array<{ appId: number; playtimeMinutes: number }>) => void;
  dismissFinishPrompt: (appId: number) => void;
  addJournalEntry: (appId: number, body: string, createdAt: number, playedMinutes: number) => void;
  updateJournalEntry: (appId: number, entryId: string, patch: Partial<Pick<DiaryJournalEntry, "body" | "createdAt">>) => void;
  removeJournalEntry: (appId: number, entryId: string) => void;
  addPage: (title: string, markdown?: string, scope?: DiaryPageScope, appIds?: number[]) => string | null;
  updatePage: (pageId: string, patch: Partial<Pick<DiarySection, "title" | "markdown" | "scope" | "appIds">>) => void;
  recordRevision: (revision: Omit<DiaryRevision, "id" | "createdAt"> & { createdAt?: number }) => void;
  removePage: (pageId: string) => void;
  addTemplate: (input: Pick<DiaryTemplate, "name" | "description" | "markdown">) => string | null;
  updateTemplate: (templateId: string, patch: Partial<Pick<DiaryTemplate, "name" | "description" | "markdown">>) => void;
  removeTemplate: (templateId: string) => void;
  /** Compatibility helpers for data created by the first Diary prototype. */
  addSection: (appId: number, title: string, markdown?: string) => string | null;
  updateSection: (appId: number, sectionId: string, patch: Partial<Pick<DiarySection, "title" | "markdown">>) => void;
  removeSection: (appId: number, sectionId: string) => void;
}

const STORAGE_KEY = "repressurizer-diary";
const APP_DATA_KEY = "diary.json";
const STATUS_EVENTS_STORAGE_KEY = "repressurizer-diary-status-events";
const STATUS_EVENTS_APP_DATA_KEY = "diary-status-events.json";
const BOARD_PREFS_STORAGE_KEY = "repressurizer-diary-board";
const BOARD_PREFS_APP_DATA_KEY = "diary-board.json";
const ACHIEVEMENTS_STORAGE_KEY = "repressurizer-diary-achievements";
const ACHIEVEMENTS_APP_DATA_KEY = "diary-achievements.json";

const DEFAULT_BOARD_PREFS: DiaryBoardPrefs = { columnColors: {}, hiddenColumns: [], customColumns: [], customAssignments: {} };

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim().toLowerCase() : null;
}

function normalizeBoardPrefs(value: unknown): DiaryBoardPrefs {
  if (!value || typeof value !== "object") return { columnColors: {}, hiddenColumns: [], customColumns: [], customAssignments: {} };
  const raw = value as Partial<DiaryBoardPrefs>;
  const columnColors: Record<string, string> = {};
  for (const [status, color] of Object.entries(raw.columnColors ?? {})) {
    const hex = normalizeHexColor(color);
    if (hex && status.length <= 32) columnColors[status] = hex;
  }
  const hiddenColumns = [...new Set((Array.isArray(raw.hiddenColumns) ? raw.hiddenColumns : []).filter((status): status is string => typeof status === "string" && status.length > 0 && status.length <= 32))].slice(0, 16);
  const customColumns: DiaryCustomColumn[] = (Array.isArray(raw.customColumns) ? raw.customColumns : [])
    .flatMap((column) => {
      if (!column || typeof column !== "object") return [];
      const candidate = column as Partial<DiaryCustomColumn>;
      if (typeof candidate.id !== "string" || !candidate.id.startsWith("col-") || typeof candidate.name !== "string" || !candidate.name.trim()) return [];
      const color = normalizeHexColor(candidate.color) ?? "#94a3b8";
      return [{ id: candidate.id.slice(0, 48), name: candidate.name.trim().slice(0, 24), color }];
    })
    .slice(0, 12);
  const validIds = new Set(customColumns.map((column) => column.id));
  const customAssignments: Record<string, string> = {};
  for (const [rawAppId, columnId] of Object.entries(raw.customAssignments ?? {})) {
    const appId = Number(rawAppId);
    if (Number.isFinite(appId) && typeof columnId === "string" && validIds.has(columnId)) customAssignments[appId] = columnId;
  }
  return { columnColors, hiddenColumns, customColumns, customAssignments };
}

function readLocalBoardPrefs(): DiaryBoardPrefs {
  try {
    return normalizeBoardPrefs(JSON.parse(localStorage.getItem(BOARD_PREFS_STORAGE_KEY) ?? "null"));
  } catch { return { ...DEFAULT_BOARD_PREFS }; }
}

function persistBoardPrefs(prefs: DiaryBoardPrefs) {
  const payload = JSON.stringify(prefs);
  try { localStorage.setItem(BOARD_PREFS_STORAGE_KEY, payload); } catch {}
  saveAppData(BOARD_PREFS_APP_DATA_KEY, payload).catch(() => {});
}

function normalizeAchievementEntry(value: unknown): DiaryAchievementEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DiaryAchievementEntry>;
  const unlockedAt = Number(raw.unlockedAt);
  if (typeof raw.apiName !== "string" || !raw.apiName || typeof raw.name !== "string" || !raw.name || !Number.isFinite(unlockedAt) || unlockedAt <= 0) return null;
  return { apiName: raw.apiName.slice(0, 160), name: raw.name.slice(0, 160), unlockedAt: Math.floor(unlockedAt), icon: typeof raw.icon === "string" && raw.icon.startsWith("http") ? raw.icon : null };
}

function readLocalAchievements(): { entries: Record<number, DiaryAchievementEntry[]>; syncedAt: Record<number, number> } {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY) ?? "null") as { entries?: Record<string, unknown[]>; syncedAt?: Record<string, unknown> } | null;
    return normalizeAchievementsPayload(parsed);
  } catch { return { entries: {}, syncedAt: {} }; }
}

function normalizeAchievementsPayload(parsed: { entries?: Record<string, unknown[]>; syncedAt?: Record<string, unknown> } | null): { entries: Record<number, DiaryAchievementEntry[]>; syncedAt: Record<number, number> } {
  const entries: Record<number, DiaryAchievementEntry[]> = {};
  const syncedAt: Record<number, number> = {};
  if (!parsed || typeof parsed !== "object") return { entries, syncedAt };
  for (const [rawAppId, list] of Object.entries(parsed.entries ?? {})) {
    const appId = Number(rawAppId);
    if (!Number.isFinite(appId) || !Array.isArray(list)) continue;
    const normalized = list.map(normalizeAchievementEntry).filter((entry): entry is DiaryAchievementEntry => entry !== null).sort((a, b) => b.unlockedAt - a.unlockedAt).slice(0, 500);
    if (normalized.length > 0) entries[appId] = normalized;
  }
  for (const [rawAppId, at] of Object.entries(parsed.syncedAt ?? {})) {
    const appId = Number(rawAppId);
    const stamp = Number(at);
    if (Number.isFinite(appId) && Number.isFinite(stamp)) syncedAt[appId] = stamp;
  }
  return { entries, syncedAt };
}

function persistAchievements(entries: Record<number, DiaryAchievementEntry[]>, syncedAt: Record<number, number>) {
  const payload = JSON.stringify({ entries, syncedAt });
  try { localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, payload); } catch {}
  saveAppData(ACHIEVEMENTS_APP_DATA_KEY, payload).catch(() => {});
}
const TEMPLATE_STORAGE_KEY = "repressurizer-diary-templates";
const TEMPLATE_APP_DATA_KEY = "diary-templates.json";

const DEFAULT_ENTRY: DiaryEntry = { decision: "backlog", priority: "normal", updatedAt: 0 };

function readLocalDiary(): PersistedDiary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedDiary) : {};
  } catch {
    return {};
  }
}

function normalizeTemplate(value: unknown): DiaryTemplate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DiaryTemplate>;
  if (typeof raw.id !== "string" || !raw.id.trim() || typeof raw.name !== "string" || !raw.name.trim() || typeof raw.markdown !== "string") return null;
  const createdAt = typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  return {
    id: raw.id.slice(0, 120),
    name: raw.name.trim().slice(0, 80),
    description: typeof raw.description === "string" ? raw.description.trim().slice(0, 240) : "",
    markdown: raw.markdown.slice(0, 100_000),
    createdAt,
    updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt,
  };
}

function readLocalTemplates(): DiaryTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.map(normalizeTemplate).filter((template): template is DiaryTemplate => template !== null) : [];
  } catch { return []; }
}

function persistTemplates(templates: DiaryTemplate[]) {
  const payload = JSON.stringify(templates);
  try { localStorage.setItem(TEMPLATE_STORAGE_KEY, payload); } catch {}
  saveAppData(TEMPLATE_APP_DATA_KEY, payload).catch(() => {});
}

function normalizeEntry(value: unknown): DiaryEntry {
  if (!value || typeof value !== "object") return { ...DEFAULT_ENTRY };
  const raw = value as Partial<DiaryEntry>;
  const decision: DiaryDecision = raw.decision === "next" || raw.decision === "deferred" || raw.decision === "archived" ? raw.decision : "backlog";
  const priority: DiaryPriority = raw.priority === "low" || raw.priority === "high" ? raw.priority : "normal";
  return { decision, priority, updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0, ...(raw.markedBacklog === true ? { markedBacklog: true } : {}) };
}

function normalizeStatusEvent(value: unknown): DiaryStatusEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DiaryStatusEvent>;
  const appId = Number(raw.appId);
  if (typeof raw.id !== "string" || !raw.id || !Number.isFinite(appId) || typeof raw.status !== "string" || !raw.status) return null;
  const at = typeof raw.at === "number" && Number.isFinite(raw.at) ? raw.at : Date.now();
  return { id: raw.id.slice(0, 120), appId, status: raw.status.slice(0, 32), at };
}

function readLocalStatusEvents(): DiaryStatusEvent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATUS_EVENTS_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.map(normalizeStatusEvent).filter((event): event is DiaryStatusEvent => event !== null).sort((a, b) => b.at - a.at).slice(0, 1000) : [];
  } catch { return []; }
}

function persistStatusEvents(events: DiaryStatusEvent[]) {
  const payload = JSON.stringify(events);
  try { localStorage.setItem(STATUS_EVENTS_STORAGE_KEY, payload); } catch {}
  saveAppData(STATUS_EVENTS_APP_DATA_KEY, payload).catch(() => {});
}

function normalizeFinishPromptState(value: unknown): DiaryFinishPromptState {
  if (!value || typeof value !== "object") return { promptedAtMinutes: 0, dismissed: false };
  const raw = value as Partial<DiaryFinishPromptState>;
  return {
    promptedAtMinutes: typeof raw.promptedAtMinutes === "number" && Number.isFinite(raw.promptedAtMinutes) ? Math.max(0, Math.floor(raw.promptedAtMinutes)) : 0,
    dismissed: raw.dismissed === true,
  };
}

function normalizeJournalEntry(value: unknown): DiaryJournalEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DiaryJournalEntry>;
  if (typeof raw.id !== "string" || !raw.id.trim() || typeof raw.body !== "string" || !raw.body.trim()) return null;
  const createdAt = typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  const playedMinutes = typeof raw.playedMinutes === "number" && Number.isFinite(raw.playedMinutes) ? Math.max(0, Math.floor(raw.playedMinutes)) : 0;
  return { id: raw.id, body: raw.body.slice(0, 4000), createdAt, playedMinutes, updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : undefined };
}

function normalizePage(value: unknown, fallbackAppId?: number): DiarySection | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DiarySection>;
  if (typeof raw.id !== "string" || !raw.id.trim() || typeof raw.title !== "string" || !raw.title.trim()) return null;
  const createdAt = typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  const updatedAt = typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;
  const scope: DiaryPageScope = raw.scope === "all" ? "all" : "selected";
  const appIds = scope === "all"
    ? []
    : [...new Set((Array.isArray(raw.appIds) ? raw.appIds : []).filter((appId): appId is number => typeof appId === "number" && Number.isFinite(appId)))].slice(0, 500);
  if (scope === "selected" && appIds.length === 0 && typeof fallbackAppId === "number") appIds.push(fallbackAppId);
  if (scope === "selected" && appIds.length === 0) return null;
  return { id: raw.id.slice(0, 120), title: raw.title.trim().slice(0, 80), markdown: typeof raw.markdown === "string" ? raw.markdown.slice(0, 100_000) : "", scope, appIds, createdAt, updatedAt };
}

function normalizeRevision(value: unknown): DiaryRevision | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DiaryRevision>;
  if (typeof raw.id !== "string" || !raw.id || (raw.target !== "overview" && raw.target !== "page") || typeof raw.targetId !== "string" || typeof raw.markdown !== "string") return null;
  return {
    id: raw.id.slice(0, 120),
    target: raw.target,
    targetId: raw.targetId.slice(0, 160),
    appId: typeof raw.appId === "number" && Number.isFinite(raw.appId) ? raw.appId : undefined,
    title: typeof raw.title === "string" ? raw.title.slice(0, 80) : undefined,
    markdown: raw.markdown.slice(0, 100_000),
    createdAt: typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

function normalizePersisted(raw: PersistedDiary | null | undefined): {
  entries: Record<number, DiaryEntry>;
  queue: number[];
  finishPrompts: Record<number, DiaryFinishPromptState>;
  journal: Record<number, DiaryJournalEntry[]>;
  pages: DiarySection[];
  revisions: DiaryRevision[];
  board: Record<number, number>;
} {
  const entries: Record<number, DiaryEntry> = {};
  for (const [appId, entry] of Object.entries(raw?.entries ?? {})) {
    const parsedId = Number(appId);
    if (Number.isFinite(parsedId)) entries[parsedId] = normalizeEntry(entry);
  }
  const queue = [...new Set((raw?.queue ?? []).filter((appId) => Number.isFinite(appId)))];
  const finishPrompts: Record<number, DiaryFinishPromptState> = {};
  for (const [appId, state] of Object.entries(raw?.finishPrompts ?? {})) {
    const parsedId = Number(appId);
    if (Number.isFinite(parsedId)) finishPrompts[parsedId] = normalizeFinishPromptState(state);
  }
  const journal: Record<number, DiaryJournalEntry[]> = {};
  for (const [appId, rawEntries] of Object.entries(raw?.journal ?? {})) {
    const parsedId = Number(appId);
    if (!Number.isFinite(parsedId) || !Array.isArray(rawEntries)) continue;
    const normalized = rawEntries.map(normalizeJournalEntry).filter((entry): entry is DiaryJournalEntry => entry !== null).sort((a, b) => b.createdAt - a.createdAt);
    if (normalized.length > 0) journal[parsedId] = normalized;
  }
  const pages: DiarySection[] = [];
  const seen = new Set<string>();
  for (const page of raw?.pages ?? []) {
    const normalized = normalizePage(page);
    if (normalized && !seen.has(normalized.id)) { pages.push(normalized); seen.add(normalized.id); }
  }
  for (const [appId, rawSections] of Object.entries(raw?.sections ?? {})) {
    const parsedId = Number(appId);
    if (!Number.isFinite(parsedId) || !Array.isArray(rawSections)) continue;
    for (const section of rawSections) {
      const normalized = normalizePage(section, parsedId);
      if (normalized && !seen.has(normalized.id)) { pages.push(normalized); seen.add(normalized.id); }
    }
  }
  pages.sort((a, b) => a.createdAt - b.createdAt);
  const revisions = (raw?.revisions ?? []).map(normalizeRevision).filter((revision): revision is DiaryRevision => revision !== null).sort((a, b) => b.createdAt - a.createdAt).slice(0, 500);
  const board: Record<number, number> = {};
  for (const [appId, rank] of Object.entries(raw?.board ?? {})) {
    const parsedId = Number(appId);
    if (Number.isFinite(parsedId) && typeof rank === "number" && Number.isFinite(rank)) board[parsedId] = Math.max(0, Math.floor(rank));
  }
  return { entries, queue, finishPrompts, journal, pages, revisions, board };
}

let autoBackupTimer: ReturnType<typeof setTimeout> | null = null;
let lastAutoBackupAt = 0;
const AUTO_BACKUP_DEBOUNCE_MS = 30_000;

function scheduleAutoBackup() {
  const now = Date.now();
  if (now - lastAutoBackupAt < AUTO_BACKUP_DEBOUNCE_MS) return;
  if (autoBackupTimer) clearTimeout(autoBackupTimer);
  autoBackupTimer = setTimeout(() => {
    autoBackupTimer = null;
    lastAutoBackupAt = Date.now();
    createDiaryBackup("Auto-backup").catch(() => {});
  }, 2000);
}

function persistDiary(entries: Record<number, DiaryEntry>, queue: number[], finishPrompts: Record<number, DiaryFinishPromptState>, journal: Record<number, DiaryJournalEntry[]>, pages: DiarySection[], revisions: DiaryRevision[], board: Record<number, number>) {
  const payload = JSON.stringify({ entries, queue, finishPrompts, journal, pages, revisions, board });
  try { localStorage.setItem(STORAGE_KEY, payload); } catch {}
  saveAppData(APP_DATA_KEY, payload).catch(() => {});
  scheduleAutoBackup();
}

function entryWithDefaults(entry: DiaryEntry | undefined): DiaryEntry { return { ...DEFAULT_ENTRY, ...entry }; }
function makeId(): string { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function appendRevision(revisions: DiaryRevision[], input: Omit<DiaryRevision, "id" | "createdAt"> & { createdAt?: number }): DiaryRevision[] {
  const latest = revisions.find((revision) => revision.target === input.target && revision.targetId === input.targetId);
  if (latest && latest.markdown === input.markdown && latest.title === input.title) return revisions;
  const revision: DiaryRevision = { ...input, id: makeId(), createdAt: input.createdAt ?? Date.now(), markdown: input.markdown.slice(0, 100_000) };
  const sameTarget = revisions.filter((item) => item.target === input.target && item.targetId === input.targetId).slice(0, 39);
  const otherTargets = revisions.filter((item) => item.target !== input.target || item.targetId !== input.targetId);
  return [revision, ...sameTarget, ...otherTargets].sort((a, b) => b.createdAt - a.createdAt).slice(0, 500);
}

const initialDiary = normalizePersisted(readLocalDiary());
const initialTemplates = readLocalTemplates();
const initialStatusEvents = readLocalStatusEvents();
const initialBoardPrefs = readLocalBoardPrefs();
const initialAchievements = readLocalAchievements();

export const useDiaryStore = create<DiaryState>((set, get) => ({
  entries: initialDiary.entries,
  queue: initialDiary.queue,
  finishPrompts: initialDiary.finishPrompts,
  journal: initialDiary.journal,
  pages: initialDiary.pages,
  revisions: initialDiary.revisions,
  board: initialDiary.board,
  statusEvents: initialStatusEvents,
  achievements: initialAchievements.entries,
  achievementsSyncedAt: initialAchievements.syncedAt,
  boardPrefs: initialBoardPrefs,
  templates: initialTemplates,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const local = { entries: get().entries, queue: get().queue, finishPrompts: get().finishPrompts, journal: get().journal, pages: get().pages, revisions: get().revisions, board: get().board, templates: get().templates };
    try {
      const [diaryResult, templateResult, eventsResult, boardPrefsResult, achievementsResult] = await Promise.allSettled([loadAppData(APP_DATA_KEY), loadAppData(TEMPLATE_APP_DATA_KEY), loadAppData(STATUS_EVENTS_APP_DATA_KEY), loadAppData(BOARD_PREFS_APP_DATA_KEY), loadAppData(ACHIEVEMENTS_APP_DATA_KEY)]);
      const raw = diaryResult.status === "fulfilled" ? diaryResult.value : null;
      const rawTemplates = templateResult.status === "fulfilled" ? templateResult.value : null;
      const rawEvents = eventsResult.status === "fulfilled" ? eventsResult.value : null;
      const rawBoardPrefs = boardPrefsResult.status === "fulfilled" ? boardPrefsResult.value : null;
      const rawAchievements = achievementsResult.status === "fulfilled" ? achievementsResult.value : null;
      let achievements = get().achievements;
      let achievementsSyncedAt = get().achievementsSyncedAt;
      if (rawAchievements) {
        try {
          const remoteAchievements = normalizeAchievementsPayload(JSON.parse(rawAchievements));
          achievements = { ...achievements, ...remoteAchievements.entries };
          achievementsSyncedAt = { ...achievementsSyncedAt, ...remoteAchievements.syncedAt };
        } catch {}
      }
      const persisted = normalizePersisted(raw ? (JSON.parse(raw) as PersistedDiary) : null);
      const entries = { ...local.entries, ...persisted.entries };
      const queue = persisted.queue.length > 0 ? persisted.queue : local.queue;
      const finishPrompts = { ...local.finishPrompts, ...persisted.finishPrompts };
      const journal = { ...local.journal, ...persisted.journal };
      const pages = [...local.pages, ...persisted.pages.filter((page) => !local.pages.some((localPage) => localPage.id === page.id))];
      const revisions = [...local.revisions, ...persisted.revisions.filter((revision) => !local.revisions.some((localRevision) => localRevision.id === revision.id))].sort((a, b) => b.createdAt - a.createdAt).slice(0, 500);
      const board = { ...local.board, ...persisted.board };
      const persistedTemplates = rawTemplates ? (JSON.parse(rawTemplates) as unknown) : [];
      const remoteTemplates = Array.isArray(persistedTemplates) ? persistedTemplates.map(normalizeTemplate).filter((template): template is DiaryTemplate => template !== null) : [];
      const templates = [...local.templates, ...remoteTemplates.filter((template) => !local.templates.some((localTemplate) => localTemplate.id === template.id))].slice(0, 200);
      let statusEvents = get().statusEvents;
      if (rawEvents) {
        try {
          const parsedEvents = JSON.parse(rawEvents) as unknown;
          const remoteEvents = Array.isArray(parsedEvents) ? parsedEvents.map(normalizeStatusEvent).filter((event): event is DiaryStatusEvent => event !== null) : [];
          const seen = new Set(statusEvents.map((event) => event.id));
          statusEvents = [...statusEvents, ...remoteEvents.filter((event) => !seen.has(event.id))].sort((a, b) => b.at - a.at).slice(0, 1000);
        } catch {}
      }
      const boardPrefs = rawBoardPrefs ? (() => {
        try { return normalizeBoardPrefs(JSON.parse(rawBoardPrefs)); } catch { return get().boardPrefs; }
      })() : get().boardPrefs;
      set({ entries, queue, finishPrompts, journal, pages, revisions, board, statusEvents, achievements, achievementsSyncedAt, boardPrefs, templates, hydrated: true });
      persistDiary(entries, queue, finishPrompts, journal, pages, revisions, board);
      persistStatusEvents(statusEvents);
      persistAchievements(achievements, achievementsSyncedAt);
      persistBoardPrefs(boardPrefs);
      persistTemplates(templates);
    } catch { set({ hydrated: true }); }
  },

  setDecision: (appId, decision) => set((state) => { const entries = { ...state.entries, [appId]: { ...entryWithDefaults(state.entries[appId]), decision, updatedAt: Date.now() } }; let queue = state.queue.filter((id) => id !== appId); if (decision === "next") queue = [appId, ...queue]; persistDiary(entries, queue, state.finishPrompts, state.journal, state.pages, state.revisions, state.board); return { entries, queue }; }),
  setPriority: (appId, priority) => set((state) => { const entries = { ...state.entries, [appId]: { ...entryWithDefaults(state.entries[appId]), priority, updatedAt: Date.now() } }; persistDiary(entries, state.queue, state.finishPrompts, state.journal, state.pages, state.revisions, state.board); return { entries }; }),
  setMarkedBacklog: (appId, marked) => set((state) => {
    const current = entryWithDefaults(state.entries[appId]);
    if ((current.markedBacklog === true) === marked) return state;
    const entry: DiaryEntry = { ...current, updatedAt: Date.now(), ...(marked ? { markedBacklog: true } : {}) };
    const entries = { ...state.entries, [appId]: entry };
    persistDiary(entries, state.queue, state.finishPrompts, state.journal, state.pages, state.revisions, state.board);
    return { entries };
  }),
  logStatusEvent: (appId, status) => set((state) => {
    const latest = state.statusEvents.find((event) => event.appId === appId);
    if (latest && latest.status === status) return state;
    const event: DiaryStatusEvent = { id: makeId(), appId, status, at: Date.now() };
    const statusEvents = [event, ...state.statusEvents].sort((a, b) => b.at - a.at).slice(0, 1000);
    persistStatusEvents(statusEvents);
    return { statusEvents };
  }),
  setAchievements: (appId, entries) => set((state) => {
    const achievements = { ...state.achievements };
    const achievementsSyncedAt = { ...state.achievementsSyncedAt, [appId]: Date.now() };
    const normalized = entries.map(normalizeAchievementEntry).filter((entry): entry is DiaryAchievementEntry => entry !== null).sort((a, b) => b.unlockedAt - a.unlockedAt).slice(0, 500);
    if (normalized.length > 0) achievements[appId] = normalized;
    else delete achievements[appId];
    persistAchievements(achievements, achievementsSyncedAt);
    return { achievements, achievementsSyncedAt };
  }),
  setColumnColor: (status, color) => set((state) => {
    const columnColors = { ...state.boardPrefs.columnColors };
    if (color) columnColors[status] = color;
    else delete columnColors[status];
    const boardPrefs = { ...state.boardPrefs, columnColors };
    persistBoardPrefs(boardPrefs);
    return { boardPrefs };
  }),
  toggleColumnHidden: (status) => set((state) => {
    const hiddenColumns = state.boardPrefs.hiddenColumns.includes(status)
      ? state.boardPrefs.hiddenColumns.filter((candidate) => candidate !== status)
      : [...state.boardPrefs.hiddenColumns, status];
    const boardPrefs = { ...state.boardPrefs, hiddenColumns };
    persistBoardPrefs(boardPrefs);
    return { boardPrefs };
  }),
  addCustomColumn: (name, color) => {
    const trimmed = name.trim().slice(0, 24);
    const hex = normalizeHexColor(color);
    if (!trimmed || !hex || get().boardPrefs.customColumns.length >= 12) return null;
    const id = `col-${makeId().slice(0, 12)}`;
    set((state) => {
      const boardPrefs = { ...state.boardPrefs, customColumns: [...state.boardPrefs.customColumns, { id, name: trimmed, color: hex }] };
      persistBoardPrefs(boardPrefs);
      return { boardPrefs };
    });
    return id;
  },
  renameCustomColumn: (columnId, name) => set((state) => {
    const trimmed = name.trim().slice(0, 24);
    if (!trimmed) return state;
    const customColumns = state.boardPrefs.customColumns.map((column) => column.id === columnId ? { ...column, name: trimmed } : column);
    const boardPrefs = { ...state.boardPrefs, customColumns };
    persistBoardPrefs(boardPrefs);
    return { boardPrefs };
  }),
  removeCustomColumn: (columnId) => set((state) => {
    const customColumns = state.boardPrefs.customColumns.filter((column) => column.id !== columnId);
    if (customColumns.length === state.boardPrefs.customColumns.length) return state;
    const customAssignments: Record<string, string> = {};
    for (const [appId, assigned] of Object.entries(state.boardPrefs.customAssignments)) {
      if (assigned !== columnId) customAssignments[appId] = assigned;
    }
    const hiddenColumns = state.boardPrefs.hiddenColumns.filter((candidate) => candidate !== columnId);
    const boardPrefs = { ...state.boardPrefs, customColumns, customAssignments, hiddenColumns };
    persistBoardPrefs(boardPrefs);
    return { boardPrefs };
  }),
  setCustomAssignment: (appId, columnId) => set((state) => {
    const customAssignments = { ...state.boardPrefs.customAssignments };
    if (columnId === null) delete customAssignments[appId];
    else customAssignments[appId] = columnId;
    const boardPrefs = { ...state.boardPrefs, customAssignments };
    persistBoardPrefs(boardPrefs);
    return { boardPrefs };
  }),
  setBoardOrder: (orderedAppIds) => set((state) => { const board = { ...state.board }; orderedAppIds.forEach((appId, index) => { board[appId] = index; }); persistDiary(state.entries, state.queue, state.finishPrompts, state.journal, state.pages, state.revisions, board); return { board }; }),
  removeFromQueue: (appId) => set((state) => { const queue = state.queue.filter((id) => id !== appId); persistDiary(state.entries, queue, state.finishPrompts, state.journal, state.pages, state.revisions, state.board); return { queue }; }),
  setQueue: (queue) => set((state) => { const nextQueue = [...new Set(queue.filter((appId) => Number.isFinite(appId)))]; persistDiary(state.entries, nextQueue, state.finishPrompts, state.journal, state.pages, state.revisions, state.board); return { queue: nextQueue }; }),
  markFinishPromptSeen: (appId, playtimeMinutes) => set((state) => { const finishPrompts = { ...state.finishPrompts, [appId]: { ...state.finishPrompts[appId], promptedAtMinutes: Math.max(0, Math.floor(playtimeMinutes)), dismissed: state.finishPrompts[appId]?.dismissed === true } }; persistDiary(state.entries, state.queue, finishPrompts, state.journal, state.pages, state.revisions, state.board); return { finishPrompts }; }),
  markAllFinishPromptsSeen: (entries) => set((state) => {
    if (entries.length === 0) return state;
    const finishPrompts = { ...state.finishPrompts };
    for (const entry of entries) {
      finishPrompts[entry.appId] = { ...finishPrompts[entry.appId], promptedAtMinutes: Math.max(0, Math.floor(entry.playtimeMinutes)), dismissed: finishPrompts[entry.appId]?.dismissed === true };
    }
    persistDiary(state.entries, state.queue, finishPrompts, state.journal, state.pages, state.revisions, state.board);
    return { finishPrompts };
  }),
  dismissFinishPrompt: (appId) => set((state) => { const finishPrompts = { ...state.finishPrompts, [appId]: { promptedAtMinutes: state.finishPrompts[appId]?.promptedAtMinutes ?? 0, dismissed: true } }; persistDiary(state.entries, state.queue, finishPrompts, state.journal, state.pages, state.revisions, state.board); return { finishPrompts }; }),

  addJournalEntry: (appId, body, createdAt, playedMinutes) => set((state) => {
    const trimmed = body.trim();
    if (!trimmed) return state;
    const entry: DiaryJournalEntry = { id: makeId(), body: trimmed.slice(0, 4000), createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(), playedMinutes: Math.max(0, Math.floor(Number.isFinite(playedMinutes) ? playedMinutes : 0)) };
    const journal = { ...state.journal, [appId]: [entry, ...(state.journal[appId] ?? [])].sort((a, b) => b.createdAt - a.createdAt) };
    persistDiary(state.entries, state.queue, state.finishPrompts, journal, state.pages, state.revisions, state.board);
    return { journal };
  }),
  updateJournalEntry: (appId, entryId, patch) => set((state) => {
    const current = state.journal[appId] ?? [];
    let changed = false;
    const nextEntries = current.map((entry) => { if (entry.id !== entryId) return entry; changed = true; return { ...entry, body: typeof patch.body === "string" ? patch.body.trim().slice(0, 4000) : entry.body, createdAt: typeof patch.createdAt === "number" && Number.isFinite(patch.createdAt) ? patch.createdAt : entry.createdAt, updatedAt: Date.now() }; }).filter((entry) => entry.body.trim().length > 0).sort((a, b) => b.createdAt - a.createdAt);
    if (!changed) return state;
    const journal = { ...state.journal, [appId]: nextEntries };
    persistDiary(state.entries, state.queue, state.finishPrompts, journal, state.pages, state.revisions, state.board);
    return { journal };
  }),
  removeJournalEntry: (appId, entryId) => set((state) => { const current = state.journal[appId] ?? []; const nextEntries = current.filter((entry) => entry.id !== entryId); if (nextEntries.length === current.length) return state; const journal = { ...state.journal }; if (nextEntries.length > 0) journal[appId] = nextEntries; else delete journal[appId]; persistDiary(state.entries, state.queue, state.finishPrompts, journal, state.pages, state.revisions, state.board); return { journal }; }),

  addPage: (title, markdown = "", scope = "selected", appIds = []) => {
    const trimmedTitle = title.trim().slice(0, 80);
    const normalizedIds = [...new Set(appIds.filter((appId) => Number.isFinite(appId)))];
    if (!trimmedTitle || (scope === "selected" && normalizedIds.length === 0)) return null;
    const id = makeId();
    set((state) => { const now = Date.now(); const page: DiarySection = { id, title: trimmedTitle, markdown: markdown.slice(0, 100_000), scope, appIds: scope === "all" ? [] : normalizedIds.slice(0, 500), createdAt: now, updatedAt: now }; const pages = [...state.pages, page]; persistDiary(state.entries, state.queue, state.finishPrompts, state.journal, pages, state.revisions, state.board); return { pages }; });
    return id;
  },
  updatePage: (pageId, patch) => set((state) => {
    let changed = false;
    let revisions = state.revisions;
    const pages = state.pages.map((page) => {
      if (page.id !== pageId) return page;
      const scope = patch.scope ?? page.scope;
      const appIds = scope === "all" ? [] : [...new Set((patch.appIds ?? page.appIds).filter((appId) => Number.isFinite(appId)))].slice(0, 500);
      const title = typeof patch.title === "string" && patch.title.trim() ? patch.title.trim().slice(0, 80) : page.title;
      const markdown = typeof patch.markdown === "string" ? patch.markdown.slice(0, 100_000) : page.markdown;
      changed = title !== page.title || markdown !== page.markdown || scope !== page.scope || appIds.join(",") !== page.appIds.join(",");
      if (!changed) return page;
      if (title !== page.title || markdown !== page.markdown) revisions = appendRevision(revisions, { target: "page", targetId: page.id, title: page.title, markdown: page.markdown });
      return { ...page, title, markdown, scope, appIds, updatedAt: Date.now() };
    });
    if (!changed) return state;
    persistDiary(state.entries, state.queue, state.finishPrompts, state.journal, pages, revisions, state.board);
    return { pages, revisions };
  }),
  recordRevision: (input) => set((state) => { const revisions = appendRevision(state.revisions, input); if (revisions === state.revisions) return state; persistDiary(state.entries, state.queue, state.finishPrompts, state.journal, state.pages, revisions, state.board); return { revisions }; }),
  removePage: (pageId) => set((state) => { const pages = state.pages.filter((page) => page.id !== pageId); if (pages.length === state.pages.length) return state; persistDiary(state.entries, state.queue, state.finishPrompts, state.journal, pages, state.revisions, state.board); return { pages }; }),

  addTemplate: (input) => {
    const name = input.name.trim().slice(0, 80);
    if (!name || !input.markdown.trim()) return null;
    const id = makeId();
    set((state) => {
      const now = Date.now();
      const template: DiaryTemplate = { id, name, description: input.description.trim().slice(0, 240), markdown: input.markdown.slice(0, 100_000), createdAt: now, updatedAt: now };
      const templates = [...state.templates, template].slice(-200);
      persistTemplates(templates);
      return { templates };
    });
    return id;
  },
  updateTemplate: (templateId, patch) => set((state) => {
    let changed = false;
    const templates = state.templates.map((template) => {
      if (template.id !== templateId) return template;
      const name = typeof patch.name === "string" && patch.name.trim() ? patch.name.trim().slice(0, 80) : template.name;
      const description = typeof patch.description === "string" ? patch.description.trim().slice(0, 240) : template.description;
      const markdown = typeof patch.markdown === "string" ? patch.markdown.slice(0, 100_000) : template.markdown;
      changed = name !== template.name || description !== template.description || markdown !== template.markdown;
      return changed ? { ...template, name, description, markdown, updatedAt: Date.now() } : template;
    });
    if (!changed) return state;
    persistTemplates(templates);
    return { templates };
  }),
  removeTemplate: (templateId) => set((state) => {
    const templates = state.templates.filter((template) => template.id !== templateId);
    if (templates.length === state.templates.length) return state;
    persistTemplates(templates);
    return { templates };
  }),

  addSection: (appId, title, markdown = "") => get().addPage(title, markdown, "selected", [appId]),
  updateSection: (_appId, sectionId, patch) => get().updatePage(sectionId, patch),
  removeSection: (_appId, sectionId) => get().removePage(sectionId),
}));
