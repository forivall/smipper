import { Cache, CacheEntry } from "./Cache";
import { SourceMapData } from "./types";

export interface Smipper {
    verbose: (...params: unknown[]) => void;
    stack?: string;
    json: boolean;
    jsc: number;
    cacheKey?: string;
    cacheDir: string;
    cacheSize: number;
    cache?: Cache;
    cacheEntry?: CacheEntry;
    sourceMaps: Record<string, SourceMapData>;
}
