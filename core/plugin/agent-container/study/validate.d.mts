export interface TopicProblem { file: string; path: string; rule: string; message: string }
export declare const GUIDE_SECTIONS: readonly string[]
export declare function checkTopic(dir: string): TopicProblem[]
export declare function checkTopicWith(read: (name: string) => string | null, folder: string, where?: string): TopicProblem[]
