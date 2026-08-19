export interface DiaryTemplate {
  id: string;
  name: string;
  description: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
}

export interface DiaryTemplateContext {
  gameTitle: string;
  status: string;
  playtime: string;
  hltb: string;
  rating: string;
  genre: string;
  developer: string;
  publisher: string;
  releaseDate: string;
  lastPlayed: string;
  today: string;
}

const BASIC_REVIEW_IT = `# Recensione — <game_title>

| Info | Valore |
| --- | --- |
| Durata | <playtime> |
| HLTB | <hltb> |
| Voto | <rating> |

## Recensione

`;

const BASIC_REVIEW_EN = `# Review — <game_title>

| Info | Value |
| --- | --- |
| Playtime | <playtime> |
| HLTB | <hltb> |
| Rating | <rating> |

## Review

`;

const ADVANCED_REVIEW_IT = `# Recensione — <game_title>

| Informazione | Valore |
| --- | --- |
| Durata | <playtime> |
| Tempo HLTB | <hltb> |
| Stato | <status> |
| Voto | <rating> |
| Genere | <genre> |
| Sviluppatore | <developer> |
| Ultima partita | <last_played> |

## Recensione

## Cosa mi è piaciuto

-

## Cosa migliorerei

-

## Commento finale
`;

const ADVANCED_REVIEW_EN = `# Review — <game_title>

| Information | Value |
| --- | --- |
| Playtime | <playtime> |
| HLTB time | <hltb> |
| Status | <status> |
| Rating | <rating> |
| Genre | <genre> |
| Developer | <developer> |
| Last played | <last_played> |

## Review

## What I liked

-

## What I would improve

-

## Final note
`;

export function getDefaultDiaryTemplates(language: string): DiaryTemplate[] {
  const italian = language.toLowerCase().startsWith("it");
  return [
    {
      id: "default-basic-review",
      name: italian ? "Recensione base" : "Basic review",
      description: italian ? "Titolo e testo libero della recensione." : "A title and a free-form review.",
      markdown: italian ? BASIC_REVIEW_IT : BASIC_REVIEW_EN,
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: "default-advanced-review",
      name: italian ? "Recensione avanzata" : "Advanced review",
      description: italian ? "Scheda di gioco, completamento, voto, analisi e nota finale." : "Game facts, completion, rating, analysis, and final notes.",
      markdown: italian ? ADVANCED_REVIEW_IT : ADVANCED_REVIEW_EN,
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: "default-quotes",
      name: italian ? "Citazioni" : "Quotes",
      description: italian ? "Citazioni memorabili organizzate in tabella." : "Memorable quotes organized in a table.",
      markdown: italian ? "# Citazioni — <game_title>\n\n> Una frase da ricordare…\n\n| Momento | Citazione |\n| --- | --- |\n| <momento> | <citazione> |\n" : "# Quotes — <game_title>\n\n> A line worth remembering…\n\n| Moment | Quote |\n| --- | --- |\n| <moment> | <quote> |\n",
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: "default-checklist",
      name: "Checklist",
      description: italian ? "Obiettivi, attività opzionali e completamento." : "Objectives, optional activities, and completion.",
      markdown: italian ? "# Checklist — <game_title>\n\n- [ ] Finire la storia\n- [ ] Completare i contenuti opzionali\n- [ ] Ottenere tutti gli achievement\n" : "# Checklist — <game_title>\n\n- [ ] Finish the story\n- [ ] Complete optional content\n- [ ] Unlock every achievement\n",
      createdAt: 0,
      updatedAt: 0,
    },
  ];
}

const CONTEXT_KEYS: Record<keyof DiaryTemplateContext, string[]> = {
  gameTitle: ["game_title", "titolo_gioco"],
  status: ["status", "stato"],
  playtime: ["playtime", "durata"],
  hltb: ["hltb", "hltb_time", "tempo_hltb"],
  rating: ["rating", "voto"],
  genre: ["genre", "genere"],
  developer: ["developer", "sviluppatore"],
  publisher: ["publisher", "editore"],
  releaseDate: ["release_date", "data_uscita"],
  lastPlayed: ["last_played", "ultima_sessione"],
  // started_at, finished_at, all_achievements removed: not auto-populated
  today: ["today", "oggi"],
};

export function resolveDiaryTemplate(markdown: string, context: DiaryTemplateContext): string {
  let resolved = markdown;
  for (const [field, aliases] of Object.entries(CONTEXT_KEYS) as Array<[keyof DiaryTemplateContext, string[]]>) {
    for (const alias of aliases) resolved = resolved.replaceAll(`<${alias}>`, context[field]);
  }
  return resolved;
}

export function diaryTemplatePlaceholders(_language?: string): Array<{ tag: string; description: string }> {
  return [
    { tag: "<game_title>", description: "Game title · automatic" },
    { tag: "<status>", description: "Diary status · automatic" },
    { tag: "<playtime>", description: "Played time · automatic" },
    { tag: "<hltb>", description: "HowLongToBeat time · automatic" },
    { tag: "<rating>", description: "Personal rating · automatic" },
    { tag: "<genre>", description: "Primary genre · automatic" },
    { tag: "<developer>", description: "Developer · automatic" },
    { tag: "<publisher>", description: "Publisher · automatic" },
    { tag: "<release_date>", description: "Release date · automatic" },
    { tag: "<last_played>", description: "Last played · automatic" },
    { tag: "<today>", description: "Current date · automatic" },
  ];
}
