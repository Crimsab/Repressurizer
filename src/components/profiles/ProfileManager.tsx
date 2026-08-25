import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  Copy,
  DownloadSimple,
  PencilSimple,
  UploadSimple,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import {
  createRepressurizerProfile,
  diffProfileSections,
  parseRepressurizerProfile,
  selectProfileSections,
  type ProfileSectionKey,
  type RepressurizerProfileDocument,
} from "../../lib/repressurizerProfile";
import {
  createDiaryBackup,
  createManualBackup,
  detectSteamAt,
} from "../../lib/tauri";
import { useT, type TranslationKey } from "../../lib/i18n";
import { useEntityJournalStore } from "../../stores/entityJournalStore";
import { useProfileStore } from "../../stores/profileStore";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  applyProfileSections,
  captureProfileSections,
} from "../../stores/profileRuntime";
import { useToastStore } from "../../stores/toastStore";
import { DialogOverlay } from "../ui/DialogOverlay";
import { ResizableDialogPanel } from "../ui/ResizableDialogPanel";
import { SelectMenu } from "../ui/SelectMenu";
import { ProfileSyncPanel } from "./ProfileSyncPanel";

const SECTIONS: ProfileSectionKey[] = [
  "diary",
  "kanban",
  "autocat",
  "planner",
  "preferences",
  "settings",
  "collections",
  "history",
];

function captureSections(
  includeHistory: boolean,
): RepressurizerProfileDocument["sections"] {
  return captureProfileSections(includeHistory);
}

function currentDocument(
  name: string,
  profileId: string,
  account: string,
  selected: ReadonlySet<ProfileSectionKey>,
): RepressurizerProfileDocument {
  const base = createRepressurizerProfile({
    profileId,
    name,
    deviceId: useEntityJournalStore.getState().deviceId,
    steamAccountId: account || null,
    sections: captureSections(selected.has("history")),
  });
  return selectProfileSections(base, selected);
}

export function ProfileManager({ onClose }: { onClose: () => void }) {
  const t = useT();
  const profileStore = useProfileStore();
  const settings = useSettingsStore();
  const toast = useToastStore;
  const [name, setName] = useState("Main Profile");
  const [account, setAccount] = useState(settings.steamId64);
  const [steamUsers, setSteamUsers] = useState<
    Array<{ id64: string; personaName: string }>
  >([]);
  const [selected, setSelected] = useState<Set<ProfileSectionKey>>(
    new Set(SECTIONS.filter((section) => section !== "history")),
  );
  const [incoming, setIncoming] = useState<RepressurizerProfileDocument | null>(
    null,
  );
  const [importSelected, setImportSelected] = useState<Set<ProfileSectionKey>>(
    new Set(),
  );
  const [importing, setImporting] = useState(false);
  const localSections = useMemo(
    () => captureSections(true),
    [incoming, profileStore.profiles.length],
  );
  const importDiff = incoming
    ? diffProfileSections(localSections, incoming.sections)
    : [];

  useEffect(() => {
    if (!settings.steamPath) return;
    let cancelled = false;
    void detectSteamAt(settings.steamPath)
      .then((info) => {
        if (!cancelled)
          setSteamUsers(
            info.users.map((user) => ({
              id64: user.id64,
              personaName:
                user.persona_name ||
                (user.id64 === settings.steamId64
                  ? settings.steamPersonaName
                  : ""),
            })),
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settings.steamId64, settings.steamPath, settings.steamPersonaName]);
  const accountOptions = useMemo(() => {
    const users = [...steamUsers];
    if (
      settings.steamId64 &&
      !users.some((user) => user.id64 === settings.steamId64)
    )
      users.unshift({
        id64: settings.steamId64,
        personaName: settings.steamPersonaName,
      });
    return users.map((user) => ({
      value: user.id64,
      label: `${user.personaName || "Steam user"} (${user.id64})`,
    }));
  }, [settings.steamId64, settings.steamPersonaName, steamUsers]);

  const toggle = (section: ProfileSectionKey, target: "export" | "import") => {
    const setter = target === "export" ? setSelected : setImportSelected;
    const source = target === "export" ? selected : importSelected;
    setter(
      new Set(
        source.has(section)
          ? [...source].filter((item) => item !== section)
          : [...source, section],
      ),
    );
  };
  const exportProfile = async () => {
    const id = `profile-${Date.now().toString(36)}`;
    const document = currentDocument(name, id, account, selected);
    profileStore.upsert(document);
    const path = await save({
      defaultPath: `${
        name
          .trim()
          .replace(/[^a-z0-9]+/gi, "-")
          .toLowerCase() || "repressurizer-profile"
      }.repressurizer-profile.json`,
      filters: [{ name: "Repressurizer Profile", extensions: ["json"] }],
    });
    if (!path) return;
    await writeTextFile(path, JSON.stringify(document, null, 2));
    toast.getState().success(t("profiles.exported"));
  };
  const chooseImport = async () => {
    const path = await open({
      multiple: false,
      filters: [{ name: "Repressurizer Profile", extensions: ["json"] }],
    });
    if (!path || Array.isArray(path)) return;
    try {
      const parsed = parseRepressurizerProfile(
        JSON.parse(await readTextFile(path)),
      );
      if (!parsed.document)
        throw new Error(t(`profiles.error.${parsed.error}` as TranslationKey));
      setIncoming(parsed.document);
      setImportSelected(new Set(parsed.document.manifest.includedSections));
    } catch (error) {
      toast
        .getState()
        .error(t("profiles.importFailed", { error: String(error) }));
    }
  };
  const applyImport = async () => {
    if (!incoming || importing) return;
    setImporting(true);
    try {
      const backup = currentDocument(
        "Pre-import backup",
        `backup-${Date.now().toString(36)}`,
        settings.steamId64,
        new Set(SECTIONS),
      );
      profileStore.backup(backup);
      await createDiaryBackup("Pre-profile import");
      if (importSelected.has("collections")) {
        if (!settings.steamPath || !settings.steamId3)
          throw new Error(t("profiles.backupUnavailable"));
        await createManualBackup(
          settings.steamPath,
          settings.steamId3,
          "Pre-profile import",
        );
      }
      applyProfileSections(incoming, importSelected, "import");
      profileStore.upsert(incoming);
      setIncoming(null);
      toast.getState().success(t("profiles.imported"));
    } catch (error) {
      toast
        .getState()
        .error(t("profiles.importFailed", { error: String(error) }));
    } finally {
      setImporting(false);
    }
  };

  return (
    <DialogOverlay
      label={t("profiles.title")}
      onClose={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-4"
    >
      <ResizableDialogPanel
        dialogId="profile-manager"
        defaultSize={{ width: 1040, height: 760 }}
        minSize={{ width: 640, height: 500 }}
        className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-dialog"
      >
        {({ sizeControls }) => (
          <>
            <header className="flex items-start justify-between border-b border-repressurizer-border px-4 py-3">
              <div className="flex gap-2.5">
                <UserCircle size={20} className="text-repressurizer-accent" />
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {t("profiles.title")}
                  </h2>
                  <p className="text-xs text-repressurizer-text-faint">
                    {t("profiles.description")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {sizeControls}
                <button
                  aria-label={t("common.close")}
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-repressurizer-text-muted hover:bg-repressurizer-surface-hover"
                >
                  <X size={16} />
                </button>
              </div>
            </header>
            <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-2">
              <section className="border-b border-repressurizer-border-subtle p-4 md:border-b-0 md:border-r">
                <h3 className="text-sm font-semibold text-white">
                  {t("profiles.export")}
                </h3>
                <div className="mt-3 grid gap-2">
                  <Field
                    label={t("profiles.name")}
                    value={name}
                    onChange={setName}
                  />
                  <div className="min-w-0">
                    <SelectMenu
                      label={t("profiles.account")}
                      ariaLabel={t("profiles.account")}
                      value={account}
                      onChange={setAccount}
                      options={accountOptions}
                      size="sm"
                    />
                  </div>
                </div>
                <SectionChecks
                  selected={selected}
                  onToggle={(section) => toggle(section, "export")}
                />
                <p className="mt-3 text-[10px] text-repressurizer-text-faint">
                  {t("profiles.secretNotice")}
                </p>
                <button
                  onClick={() => void exportProfile()}
                  disabled={!selected.size}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  <DownloadSimple size={13} />
                  {t("profiles.exportFile")}
                </button>
                <div className="mt-6 border-t border-repressurizer-border-subtle pt-4">
                  <h3 className="text-xs font-semibold uppercase text-repressurizer-text-faint">
                    {t("profiles.saved")}
                  </h3>
                  <div className="mt-2 space-y-2">
                    {profileStore.profiles.map((profile) => (
                      <div
                        key={profile.manifest.profileId}
                        className="flex items-center gap-2 rounded-lg border border-repressurizer-border-subtle p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-white">
                            {profile.manifest.name}
                          </p>
                          <p className="text-[9px] text-repressurizer-text-faint">
                            {profile.manifest.steamAccountId ??
                              t("profiles.noAccount")}{" "}
                            · {profile.manifest.includedSections.length}
                          </p>
                        </div>
                        <button
                          aria-label={t("profiles.rename")}
                          onClick={() => {
                            const next = window.prompt(
                              t("profiles.rename"),
                              profile.manifest.name,
                            );
                            if (next?.trim())
                              profileStore.rename(
                                profile.manifest.profileId,
                                next.trim(),
                              );
                          }}
                          className="p-1 text-repressurizer-text-muted"
                        >
                          <PencilSimple size={12} />
                        </button>
                        <button
                          aria-label={t("profiles.duplicate")}
                          onClick={() =>
                            profileStore.duplicate(profile.manifest.profileId)
                          }
                          className="p-1 text-repressurizer-text-muted"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
              <section className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    {t("profiles.import")}
                  </h3>
                  <button
                    onClick={() => void chooseImport()}
                    className="inline-flex items-center gap-1 rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted"
                  >
                    <UploadSimple size={13} />
                    {t("profiles.chooseFile")}
                  </button>
                </div>
                {incoming ? (
                  <>
                    <div className="mt-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/45 p-3">
                      <p className="text-sm text-white">
                        {incoming.manifest.name}
                      </p>
                      <p className="text-[10px] text-repressurizer-text-faint">
                        schema {incoming.manifest.schemaVersion} ·{" "}
                        {incoming.manifest.deviceId} ·{" "}
                        {incoming.manifest.steamAccountId ??
                          t("profiles.noAccount")}
                      </p>
                    </div>
                    <div className="mt-3 space-y-2">
                      {importDiff
                        .filter((diff) =>
                          incoming.manifest.includedSections.includes(
                            diff.section,
                          ),
                        )
                        .map((diff) => (
                          <label
                            key={diff.section}
                            className="flex items-center gap-3 rounded-lg border border-repressurizer-border-subtle p-2"
                          >
                            <input
                              type="checkbox"
                              checked={importSelected.has(diff.section)}
                              onChange={() => toggle(diff.section, "import")}
                            />
                            <span className="flex-1 text-xs text-repressurizer-text">
                              {t(
                                `profiles.section.${diff.section}` as TranslationKey,
                              )}
                            </span>
                            <span
                              className={`text-[10px] ${diff.status === "unchanged" ? "text-repressurizer-text-faint" : "text-amber-300"}`}
                            >
                              {t(
                                `profiles.diff.${diff.status}` as TranslationKey,
                              )}{" "}
                              · {diff.localItems} → {diff.incomingItems}
                            </span>
                          </label>
                        ))}
                    </div>
                    <p className="mt-3 text-[10px] text-amber-300">
                      {t("profiles.importBackupNotice")}
                    </p>
                    <button
                      onClick={() => void applyImport()}
                      disabled={!importSelected.size || importing}
                      className="mt-3 rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                    >
                      {importing
                        ? t("profiles.importing")
                        : t("profiles.applyImport")}
                    </button>
                  </>
                ) : (
                  <p className="py-20 text-center text-xs text-repressurizer-text-faint">
                    {t("profiles.importEmpty")}
                  </p>
                )}
              </section>
              <ProfileSyncPanel />
            </div>
          </>
        )}
      </ResizableDialogPanel>
    </DialogOverlay>
  );
}

function SectionChecks({
  selected,
  onToggle,
}: {
  selected: Set<ProfileSectionKey>;
  onToggle: (section: ProfileSectionKey) => void;
}) {
  const t = useT();
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {SECTIONS.map((section) => (
        <label
          key={section}
          className="flex items-center gap-2 rounded-lg border border-repressurizer-border-subtle p-2 text-[10px] text-repressurizer-text-muted"
        >
          <input
            type="checkbox"
            checked={selected.has(section)}
            onChange={() => onToggle(section)}
          />
          {t(`profiles.section.${section}` as TranslationKey)}
        </label>
      ))}
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[9px] uppercase text-repressurizer-text-faint">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-xs text-repressurizer-text"
      />
    </label>
  );
}
