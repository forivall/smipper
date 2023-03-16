import * as sourceMap from "source-map";

export type SourceMapResolve = (res: sourceMap.SourceMapConsumer) => void;
export type Rejecter = (err: Error) => void;
export interface SourceMapData {
    resolvers: SourceMapResolve[];
    rejecters: Rejecter[];
}
