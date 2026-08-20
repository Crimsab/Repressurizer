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

## Library views

Switch between four view modes with the toolbar:

- **Grid** - a card grid of games with status colors.
- **List** - a dense table you can sort.
- **Kanban** - a board with columns for each status.
- **Timeline** - a chronological view of diary activity.

Your view choice, column widths, sorting, and other preferences are persisted
between sessions.

### Kanban

The Kanban board groups games by status into columns. You can:

- Drag and drop games between columns to change their status.
- Create custom columns with a name and color, independent of the built-in statuses.
- Color-code the default columns, hide columns, and assign a game to a custom column.
- Set a soft **WIP limit** for the *playing* column; a count over the limit is
  shown as a hint, and `0` disables it.

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

- **Backups** - create a diary backup before large changes, and restore it later.
- **Export** - write journal entries, pages, notes, and ratings to a portable
  file so you can keep a copy outside the app.

Diary data stays local and is never sent to Valve or shared with other services.

!!! tip "Notes are yours"
    Because the Diary is stored locally under the app data directory, moving to
    another machine or reinstalling requires keeping your own backup of that
    folder (or using the export and backup tools above).
