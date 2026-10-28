export interface SchemaError { path: string; rule: string; message: string }
export interface TopicProblem extends SchemaError { file: string }
export declare const GUIDE_SECTIONS: readonly string[]
export declare function validate(schema: object, data: unknown, path?: string): SchemaError[]
export declare function checkTopic(dir: string): TopicProblem[]
export declare const LEAK_MIN: number
export interface Schemas { practice: object; attempts: object }
export declare function loadSchemas(dir?: string): Schemas
export declare function checkTopicWith(read: (name: string) => string | null, folder: string, schemas: Schemas, where?: string): TopicProblem[]
export declare function withAttemptsIgnored(text: string | null): string
