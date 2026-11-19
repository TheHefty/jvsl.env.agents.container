export declare const IDEA_SECTIONS: readonly ['Purpose and who it is for', 'Decisions and discarded alternatives', 'Stack', 'Open questions']
export type IdeaSection = (typeof IDEA_SECTIONS)[number]

export declare const IDEA_STATES: readonly ['raw', 'exploring', 'ready', 'discarded']
export type IdeaState = (typeof IDEA_STATES)[number] | 'became project'

export interface Idea {
  state: IdeaState
  /** The project it became, when the state is `became project`. */
  project?: string
  /** Stack name to version, or to `undecided`. */
  stacks: Record<string, string>
  /** Each section present, by name, with its text trimmed. */
  sections: Partial<Record<IdeaSection, string>>
  /** The line each present section's heading is on, 1-based. */
  sectionLines: Partial<Record<IdeaSection, number>>
}

export interface IdeaProblem {
  /** The 1-based line the problem is on, or null when it is something missing. */
  line: number | null
  message: string
}

/** The idea in `text`, and every problem with it; `idea` is null when the front matter cannot be read. */
export declare function parseIdea(text: string): { idea: Idea | null; problems: IdeaProblem[] }
/** What stands between `idea` and ready: each of the four sections missing, or empty. */
export declare function readyProblems(idea: Idea): IdeaProblem[]
