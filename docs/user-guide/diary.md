# Diary

The Diary is a personal tracking workspace that keeps game notes and progress
alongside the library. It is local to your machine: journal entries, Markdown
pages, ratings, and Kanban/Timeline details are stored in the app data folder,
not written back to Steam.

## Where things live

Once you open the Diary, three sections are available on the left:

- **Overview** - quick access to your current backlog, what is next, and recent activity.
- **Journal** - a running log of notes and entries, each tied to playtime.
- **Pages** - your own scoped or global Markdown pages.

The right side works on the library: pick a game to write notes, rate it, set a
priority, or move it through a status.

## Statuses and decisions

Each game in the Diary has a status, a priority, and a decision:

- Status: **backlog**, **playing**, **finished**, **abandoned**, or **archived**.
- Priority: **low**, **normal**, or **high**.
- Decision: **backlog**, **next**, **deferred**, or **archived**.

A decision such as *next* or *backlog* survives changes to playtime, so a game
you explicitly set as "to play" stays in that bucket even after it gets hours.

**Archived** is a reversible local Diary state for games you do not want in the
active planning flow. It is not a deletion and it does not remove the game from
Steam or from the library. Use the **Archived** filter to find it, or enable
**Show archived** in View options; from the game detail, **Restore to backlog**
puts it back into the active board.

## Library views

Switch between five view modes with the toolbar:

- **Grid** - a card grid of games with status colors.
- **List** - a dense table you can sort.
- **Kanban** - a board with columns for each status.
- **Timeline** - a chronological view of diary activity.
- **Upcoming** - a planning queue with priority, estimated remaining hours, and
  the number and date of recorded play sessions.

Your view choice, column widths, sorting, and other preferences are persisted
between sessions.

### Kanban

The Kanban board groups games by status into columns. You can:

- Drag and drop games between columns to change their status.
- Use the select-all button in a column, or focus a card/column and press
  **Ctrl+A** ( **Cmd+A** on macOS), to select every game in that column for a
  bulk move or priority change.
- Create custom columns with a name and color, independent of the built-in statuses.
- Color-code the default columns, hide columns, and assign a game to a custom column.
- Set a soft **WIP limit** for the *playing* column; a count over the limit is
  shown as a hint, and `0` disables it.
- Use the bulk toolbar to change status or priority, archive, or remove every
  selected game. Each bulk operation and drag move offers an **Undo** action.
- While dragging, the destination column and insertion position are highlighted;
  a confirmation toast reports how many games moved.

The Diary toolbar also opens the shared AutoCat workflow. First choose the data
source and configure as many conditions as needed (title, HLTB, playtime,
metadata, Diary fields, and more). **All (AND)** or **Any (OR)** sets the
connectors, and every connector can then be switched independently for mixed
expressions; AND is evaluated before OR. All AutoCat sources are available here;
the destination remains Diary/Kanban. The preview shows the complete rule as
**IF conditions THEN actions**: move matches to an existing status/custom
column, create one custom Kanban column and optionally move the matches into it,
or create one local custom column per result group and optionally move each
group. The automatic mode exposes a prefix, maximum-column limit, and same-name
reuse option, so column creation is explicit and bounded. It never creates Steam
categories from the rule. After applying, **Undo Diary AutoCat** restores the
previous Diary placements and removes columns created by that run.

For multiple independent **IF / THEN** blocks, save each rule as a preset and
use **Run all**. The app combines the matched games, keeps one shared Kanban
action, and shows the combined result before anything is changed. Empty or
invalid enabled conditions are rejected before a run.

The Diary preview has no Steam sort control, filter-result banner, or group rows
by default. It shows the **IF / THEN** plan, matched count, and expandable game
titles. Group rows become visible only when **Split matches into columns** is
selected; otherwise the explicit column chosen in **THEN** receives every
match. Creating a new column suggests a readable default derived from your
rule, and split columns reuse meaningful group names — both stay fully editable
local Kanban labels.

### Planning and backups

The **Upcoming** view is a compact next-session plan. It shows Steam playtime,
the configured HLTB estimate, remaining hours, priority, status, session count,
and the last observed play date. **Mark next** moves a game to *In progress*;
**Move to backlog** keeps it in *Da giocare*.

### Timeline

The Timeline records events from the Diary and lets you filter which kinds are
visible:

- **Session** - playtime sessions.
- **Note** - journal entries.
- **Page** - page edits.
- **Rating** - rating changes.
- **Status** - status transitions.
- **Achievement** - newly unlocked achievements.

You can pick a layout (**rail**, **cards**, or **compact**), hide event kinds
you do not need, and format dates and times to your preference.

## Achievements

Unlocked achievements for your games are included in the Diary so you can see
progress in one place. The Timeline surfaces recently unlocked achievements
alongside your notes and sessions.

## Backups and export

The Diary has its own backup and export tools, separate from the Steam
collection backups:

- **Backups** - create a diary backup before large changes. Restore opens a
  file-by-file diff so you can select only the diary pages, templates, events,
  board, ratings, notes, statuses, or achievements you want to replace.
- **Export** - write journal entries, pages, notes, and ratings to a portable
  file so you can keep a copy outside the app.

Diary data stays local and is never sent to Valve or shared with other services.

!!! tip "Notes are yours"
    Because the Diary is stored locally under the app data directory, moving to
    another machine or reinstalling requires keeping your own backup of that
    folder (or using the export and backup tools above).
