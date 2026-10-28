export interface SchemaError { path: string; rule: string; message: string }
export interface TopicProblem extends SchemaError { file: string }
export declare const GUIDE_SECTIONS: readonly string[]
export declare function validate(schema: object, data: unknown, path?: string): SchemaError[]
export declare function checkTopic(dir: string): TopicProblem[]
