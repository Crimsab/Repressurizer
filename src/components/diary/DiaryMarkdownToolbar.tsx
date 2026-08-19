import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretDown,
  Code,
  CodeBlock,
  ImageSquare,
  LinkSimple,
  ListBullets,
  ListChecks,
  ListNumbers,
  Minus,
  Plus,
  Quotes,
  SlidersHorizontal,
  Sparkle,
  Table,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  Trash,
} from "@phosphor-icons/react";
import { useDiaryStore } from "../../stores/diaryStore";
import { useT } from "../../lib/i18n";
import { diaryTemplatePlaceholders, getDefaultDiaryTemplates, resolveDiaryTemplate, type DiaryTemplate, type DiaryTemplateContext } from "../../lib/diaryTemplates";

export function MarkdownToolbar({ value, onChange, textareaRef, templateContext, language, t }: { value: string; onChange: (value: string) => void; textareaRef: RefObject<HTMLTextAreaElement | null>; templateContext: DiaryTemplateContext; language: string; t: ReturnType<typeof useT> }) {
  const [blockOpen, setBlockOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const customTemplates = useDiaryStore((state) => state.templates);
  const templates = useMemo(() => [...getDefaultDiaryTemplates(language), ...customTemplates], [customTemplates, language]);
  const historyRef = useRef<{ undo: string[]; redo: string[]; last: string; applying: boolean }>({ undo: [], redo: [], last: value, applying: false });
  useEffect(() => {
    const history = historyRef.current;
    if (history.applying) { history.applying = false; history.last = value; return; }
    if (value === history.last) return;
    const timer = window.setTimeout(() => { history.undo = [...history.undo.slice(-49), history.last]; history.redo = []; history.last = value; }, 350);
    return () => window.clearTimeout(timer);
  }, [value]);
  const applyHistory = (next: string) => { historyRef.current.applying = true; historyRef.current.last = next; onChange(next); requestAnimationFrame(() => textareaRef.current?.focus()); };
  const undo = () => { const history = historyRef.current; const previous = history.undo.pop(); if (previous === undefined) return; history.redo.push(value); applyHistory(previous); };
  const redo = () => { const history = historyRef.current; const next = history.redo.pop(); if (next === undefined) return; history.undo.push(value); applyHistory(next); };
  const insert = (before: string, after = "", placeholder = t("diary.markdown.text")) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || placeholder;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    historyRef.current.undo.push(value);
    historyRef.current.redo = [];
    historyRef.current.last = next;
    historyRef.current.applying = true;
    onChange(next);
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(start + before.length, start + before.length + selected.length); });
  };
  const insertTemplate = (template: DiaryTemplate) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? start;
    const resolved = resolveDiaryTemplate(template.markdown, templateContext);
    const prefix = start > 0 && !value.slice(0, start).endsWith("\n") ? "\n\n" : "";
    const suffix = end < value.length && !value.slice(end).startsWith("\n") ? "\n\n" : "";
    const next = `${value.slice(0, start)}${prefix}${resolved}${suffix}${value.slice(end)}`;
    historyRef.current.undo.push(value);
    historyRef.current.redo = [];
    historyRef.current.last = next;
    historyRef.current.applying = true;
    onChange(next);
    setTemplateOpen(false);
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(start + prefix.length, start + prefix.length + resolved.length); });
  };
  const toolButton = "focus-ring flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white";
  const menuClass = "absolute left-0 top-full z-30 mt-1 min-w-48 overflow-hidden rounded-lg border border-repressurizer-border bg-repressurizer-surface p-1 shadow-[0_14px_38px_rgba(0,0,0,0.5)]";
  const menuItem = "focus-ring flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white";
  return <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1 border-b border-repressurizer-border-subtle bg-repressurizer-bg/95 px-4 py-1 backdrop-blur" role="toolbar" aria-label={t("diary.markdown.toolbar")}>
    <div className="flex items-center border-r border-repressurizer-border-subtle pr-1"><button type="button" title={t("diary.markdown.undo")} aria-label={t("diary.markdown.undo")} onClick={undo} className={toolButton}><ArrowCounterClockwise size={16} /></button><button type="button" title={t("diary.markdown.redo")} aria-label={t("diary.markdown.redo")} onClick={redo} className={toolButton}><ArrowClockwise size={16} /></button></div>
    <div className="relative"><button type="button" title={t("diary.markdown.textStyle")} onClick={() => setBlockOpen((open) => !open)} className={`${toolButton} gap-1.5 text-xs`}><TextHOne size={16} /><span className="hidden min-[1500px]:inline">{t("diary.markdown.textStyle")}</span><CaretDown size={11} /></button>{blockOpen && <div className={menuClass}>{[[t("diary.markdown.heading1"), <TextHOne size={15} />, "# "], [t("diary.markdown.heading2"), <TextHTwo size={15} />, "## "], [t("diary.markdown.heading3"), <TextHThree size={15} />, "### "], [t("diary.markdown.quote"), <Quotes size={15} />, "> "], [t("diary.markdown.codeBlock"), <CodeBlock size={15} />, "\n```\n", "\n```\n"]].map(([title, icon, before, after]) => <button key={String(title)} type="button" onClick={() => { insert(String(before), after ? String(after) : ""); setBlockOpen(false); }} className={menuItem}>{icon as ReactNode}{title as string}</button>)}</div>}</div>
    <div className="flex items-center border-l border-repressurizer-border-subtle pl-1"><button type="button" title={t("diary.markdown.bold")} aria-label={t("diary.markdown.bold")} onClick={() => insert("**", "**")} className={toolButton}><TextB size={16} /></button><button type="button" title={t("diary.markdown.italic")} aria-label={t("diary.markdown.italic")} onClick={() => insert("_", "_")} className={toolButton}><TextItalic size={16} /></button><button type="button" title={t("diary.markdown.strike")} aria-label={t("diary.markdown.strike")} onClick={() => insert("~~", "~~")} className={toolButton}><TextStrikethrough size={16} /></button><button type="button" title={t("diary.markdown.code")} aria-label={t("diary.markdown.code")} onClick={() => insert("`", "`")} className={toolButton}><Code size={16} /></button><button type="button" title={t("diary.markdown.link")} aria-label={t("diary.markdown.link")} onClick={() => insert("[", "](https://)")} className={toolButton}><LinkSimple size={16} /></button></div>
    <div className="relative"><button type="button" title={t("diary.markdown.lists")} onClick={() => setListOpen((open) => !open)} className={`${toolButton} gap-1.5 text-xs`}><ListBullets size={16} /><span className="hidden min-[1500px]:inline">{t("diary.markdown.lists")}</span><CaretDown size={11} /></button>{listOpen && <div className={menuClass}>{[[t("diary.markdown.list"), <ListBullets size={15} />, "- "], [t("diary.markdown.numberedList"), <ListNumbers size={15} />, "1. "], [t("diary.markdown.task"), <ListChecks size={15} />, "- [ ] "]].map(([title, icon, before]) => <button key={String(title)} type="button" onClick={() => { insert(String(before)); setListOpen(false); }} className={menuItem}>{icon as ReactNode}{title as string}</button>)}</div>}</div>
    <div className="relative"><button type="button" title={t("diary.markdown.insert")} onClick={() => setInsertOpen((open) => !open)} className={`${toolButton} gap-1.5 text-xs`}><Plus size={15} /><span className="hidden min-[1500px]:inline">{t("diary.markdown.insert")}</span><CaretDown size={11} /></button>{insertOpen && <div className={`${menuClass} left-auto right-0`}>{[[t("diary.markdown.table"), <Table size={15} />, "\n| Column | Column |\n| --- | --- |\n| ", " |\n"], [t("diary.markdown.image"), <ImageSquare size={15} />, "![", "](https://)"], [t("diary.markdown.divider"), <Minus size={15} />, "\n---\n", ""]].map(([title, icon, before, after]) => <button key={String(title)} type="button" onClick={() => { insert(String(before), String(after), after === "" ? "" : undefined); setInsertOpen(false); }} className={menuItem}>{icon as ReactNode}{title as string}</button>)}</div>}</div>
    <div className="relative ml-auto"><button type="button" title={t("diary.templates")} aria-expanded={templateOpen} onClick={() => setTemplateOpen((open) => !open)} className={`${toolButton} gap-1.5 text-xs text-repressurizer-accent`}><Sparkle size={15} /><span className="hidden min-[1250px]:inline">{t("diary.templates")}</span><CaretDown size={11} /></button>{templateOpen && <div className={`${menuClass} left-auto right-0 w-64`}><p className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.templates.quick")}</p>{templates.map((template) => <button key={template.id} type="button" onClick={() => insertTemplate(template)} className={menuItem}><Sparkle size={14} className="shrink-0 text-repressurizer-accent" /><span className="min-w-0"><span className="block truncate text-repressurizer-text">{template.name}</span><span className="mt-0.5 block truncate text-[10px] text-repressurizer-text-faint">{template.description}</span></span></button>)}<button type="button" onClick={() => { setTemplateOpen(false); setTemplateManagerOpen(true); }} className={`${menuItem} mt-1 border-t border-repressurizer-border-subtle text-repressurizer-accent`}><SlidersHorizontal size={14} />{t("diary.templates.manage")}</button></div>}</div>
    {templateManagerOpen && <TemplateManagerDialog language={language} templateContext={templateContext} onUse={insertTemplate} onClose={() => setTemplateManagerOpen(false)} t={t} />}
  </div>;
}

function TemplateManagerDialog({ language, templateContext, onUse, onClose, t }: { language: string; templateContext: DiaryTemplateContext; onUse: (template: DiaryTemplate) => void; onClose: () => void; t: ReturnType<typeof useT> }) {
  const customTemplates = useDiaryStore((state) => state.templates);
  const addTemplate = useDiaryStore((state) => state.addTemplate);
  const updateTemplate = useDiaryStore((state) => state.updateTemplate);
  const removeTemplate = useDiaryStore((state) => state.removeTemplate);
  const defaults = useMemo(() => getDefaultDiaryTemplates(language), [language]);
  const allTemplates = useMemo(() => [...defaults, ...customTemplates], [customTemplates, defaults]);
  const [selectedId, setSelectedId] = useState(defaults[0]?.id ?? "__new__");
  const selected = allTemplates.find((template) => template.id === selectedId);
  const isDefault = selectedId.startsWith("default-");
  const isNew = selectedId === "__new__";
  const [name, setName] = useState(selected?.name ?? "");
  const [description, setDescription] = useState(selected?.description ?? "");
  const [markdown, setMarkdown] = useState(selected?.markdown ?? "");
  const markdownRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const template = allTemplates.find((item) => item.id === selectedId);
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setMarkdown(template?.markdown ?? "");
  }, [allTemplates, selectedId]);

  const selectNew = () => { setSelectedId("__new__"); setName(""); setDescription(""); setMarkdown(""); };
  const save = () => {
    if (!name.trim() || !markdown.trim()) return;
    if (isNew) {
      const id = addTemplate({ name, description, markdown });
      if (id) setSelectedId(id);
    } else if (!isDefault) updateTemplate(selectedId, { name, description, markdown });
  };
  const duplicate = () => {
    if (!selected) return;
    const id = addTemplate({ name: `${selected.name} — ${t("diary.templates.copy")}`, description: selected.description, markdown: selected.markdown });
    if (id) setSelectedId(id);
  };
  const insertPlaceholder = (tag: string) => {
    const textarea = markdownRef.current;
    const start = textarea?.selectionStart ?? markdown.length;
    const end = textarea?.selectionEnd ?? start;
    setMarkdown(`${markdown.slice(0, start)}${tag}${markdown.slice(end)}`);
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(start + tag.length, start + tag.length); });
  };
  const useCurrent = () => {
    const template = selected ?? (isNew && name.trim() && markdown.trim() ? { id: "preview", name, description, markdown, createdAt: 0, updatedAt: 0 } : undefined);
    if (!template) return;
    onUse(template);
    onClose();
  };

  return createPortal(<div role="dialog" aria-modal="true" aria-label={t("diary.templates.manage")} className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="flex h-[min(720px,94dvh)] w-[min(980px,96vw)] flex-col overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-bg shadow-[0_28px_90px_rgba(0,0,0,0.65)] sm:h-[min(720px,88dvh)] sm:flex-row sm:w-[min(980px,94vw)]">
      <aside className="flex h-48 w-full shrink-0 flex-col overflow-y-auto border-b border-repressurizer-border-subtle bg-repressurizer-surface/35 p-3 sm:h-auto sm:w-60 sm:overflow-hidden sm:border-b-0 sm:border-r">
        <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold text-white">{t("diary.templates")}</p><p className="mt-0.5 text-[10px] text-repressurizer-text-faint">{allTemplates.length} {t("diary.templates.count")}</p></div><button type="button" onClick={selectNew} aria-label={t("diary.templates.new")} title={t("diary.templates.new")} className="focus-ring rounded-md bg-repressurizer-accent/12 p-2 text-repressurizer-accent hover:bg-repressurizer-accent/20"><Plus size={15} /></button></div>
        <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.templates.defaults")}</p>
        <div className="space-y-1">{defaults.map((template) => <TemplateListButton key={template.id} template={template} active={selectedId === template.id} onClick={() => setSelectedId(template.id)} />)}</div>
        <p className="mt-4 px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.templates.mine")}</p>
        <div className="min-h-0 space-y-1 sm:flex-1 sm:overflow-y-auto">{customTemplates.length === 0 ? <p className="px-2 py-3 text-[10px] leading-relaxed text-repressurizer-text-faint">{t("diary.templates.empty")}</p> : customTemplates.map((template) => <TemplateListButton key={template.id} template={template} active={selectedId === template.id} onClick={() => setSelectedId(template.id)} />)}</div>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-repressurizer-border-subtle px-5 py-3"><div><p className="text-sm font-semibold text-white">{isNew ? t("diary.templates.new") : selected?.name}</p><p className="mt-0.5 text-[10px] text-repressurizer-text-faint">{isDefault ? t("diary.templates.defaultHint") : t("diary.templates.customHint")}</p></div><button type="button" onClick={onClose} aria-label={t("diary.pages.cancel")} className="focus-ring rounded-md px-2 py-1 text-repressurizer-text-faint hover:bg-repressurizer-surface-hover hover:text-white">×</button></header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint"><span>{t("diary.templates.name")}</span><input value={name} readOnly={isDefault} onChange={(event) => setName(event.target.value)} data-testid="diary-template-name" className="mt-1.5 w-full rounded-md border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs font-normal normal-case tracking-normal text-repressurizer-text outline-none focus:border-repressurizer-accent/55 read-only:opacity-70" /></label><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint"><span>{t("diary.templates.description")}</span><input value={description} readOnly={isDefault} onChange={(event) => setDescription(event.target.value)} data-testid="diary-template-description" className="mt-1.5 w-full rounded-md border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs font-normal normal-case tracking-normal text-repressurizer-text outline-none focus:border-repressurizer-accent/55 read-only:opacity-70" /></label></div>
          <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint"><span>{t("diary.templates.markdown")}</span><textarea ref={markdownRef} value={markdown} readOnly={isDefault} onChange={(event) => setMarkdown(event.target.value)} onDragOver={(event) => { if (!isDefault) event.preventDefault(); }} onDrop={(event) => { if (isDefault) return; event.preventDefault(); const tag = event.dataTransfer.getData("text/plain"); if (tag.startsWith("<") && tag.endsWith(">")) insertPlaceholder(tag); }} data-testid="diary-template-markdown" spellCheck={false} className="mt-1.5 min-h-72 w-full resize-y rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-3 font-mono text-xs font-normal normal-case leading-6 tracking-normal text-repressurizer-text outline-none focus:border-repressurizer-accent/55 read-only:opacity-80" /></label>
          <div className="mt-4"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint">{t("diary.templates.placeholders")}</p><p className="text-[10px] text-repressurizer-text-faint">{t("diary.templates.unknownTags")}</p></div><div className="mt-2 flex flex-wrap gap-1.5">{diaryTemplatePlaceholders(language).map(({ tag, description: hint }) => <button key={tag} type="button" draggable={!isDefault} disabled={isDefault} title={hint} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("text/plain", tag); }} onClick={() => insertPlaceholder(tag)} className="focus-ring cursor-grab rounded-md border border-repressurizer-border-subtle bg-repressurizer-surface px-2 py-1 font-mono text-[10px] text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent/35 hover:text-repressurizer-accent active:cursor-grabbing disabled:cursor-default disabled:opacity-45">{tag}</button>)}</div></div>
          <div className="mt-5 border-t border-repressurizer-border-subtle pt-4"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint">{t("diary.templates.preview")}</p><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-repressurizer-surface/60 p-3 font-mono text-[11px] leading-5 text-repressurizer-text-muted">{resolveDiaryTemplate(markdown, templateContext)}</pre></div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-repressurizer-border-subtle px-3 py-3 sm:px-5"><div>{!isDefault && !isNew && <button type="button" onClick={() => { if (window.confirm(t("diary.templates.deleteConfirm"))) { removeTemplate(selectedId); setSelectedId(defaults[0]?.id ?? "__new__"); } }} className="focus-ring inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs text-repressurizer-danger hover:bg-repressurizer-danger/10"><Trash size={14} />{t("diary.templates.delete")}</button>}</div><div className="flex items-center gap-2">{isDefault ? <button type="button" onClick={duplicate} className="focus-ring rounded-md border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted hover:bg-repressurizer-surface-hover"><span className="inline-flex items-center gap-1.5"><Plus size={14} />{t("diary.templates.duplicate")}</span></button> : <button type="button" disabled={!name.trim() || !markdown.trim()} onClick={save} className="focus-ring rounded-md border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text hover:bg-repressurizer-surface-hover disabled:opacity-40">{t("diary.templates.save")}</button>}<button type="button" disabled={!selected && !isNew} onClick={useCurrent} className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-repressurizer-accent px-4 py-2 text-xs font-medium text-white hover:bg-repressurizer-accent-hover disabled:opacity-40"><Sparkle size={14} />{t("diary.templates.use")}</button></div></footer>
      </section>
    </div>
  </div>, document.body);
}

function TemplateListButton({ template, active, onClick }: { template: DiaryTemplate; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`focus-ring w-full rounded-md px-2 py-2 text-left transition-colors ${active ? "bg-repressurizer-accent/12 text-repressurizer-accent" : "text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"}`}><span className="block truncate text-xs font-medium">{template.name}</span><span className="mt-0.5 block truncate text-[9px] text-repressurizer-text-faint">{template.description}</span></button>;
}

