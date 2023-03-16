import * as sourceMap from "source-map";

export type SourceMapResolve = (res: sourceMap.SourceMapConsumer) => void;
export type Rejecter = (err: Error) => void;
export interface SourceMapData {
    resolvers: SourceMapResolve[];
    rejecters: Rejecter[];
}

export interface Frame {
    functionName: string;
    sourceURL: string;
    line: number;
    column: number;
    index?: number;
}
