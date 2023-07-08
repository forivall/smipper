import { Smipper } from "./Smipper";
import { rewriteLocalControl } from "./rewriteLocalControl";
import fs from "fs";
import got from "got";

export async function load(smipper: Smipper, path: string): Promise<string> {
    smipper.verbose("load", path);
    if (path.startsWith("http://localcontrol.netflix.com/")) {
        path = rewriteLocalControl(smipper, path);
    }

    if (path.startsWith("file:///")) {
        return fs.readFileSync(path.substring(7), "utf8");
    }

    if (!path.startsWith("http://") && !path.startsWith("https://")) {
        throw new Error("Not a url");
    }

    if (smipper.cache && smipper.cacheKey) {
        const response = smipper.cache.get(smipper.cacheKey, path);
        if (response) {
            return response;
        }
        if (!smipper.cacheEntry) {
            smipper.cacheEntry = smipper.cache.create(smipper.cacheKey);
        }
    }

    // let retryIndex = 0;
    async function get(): Promise<string> {
        const response = await got.get(path, { timeout: 10000 });
        smipper.verbose(response.headers);
        return response.body || "";
    }

    const response = await get();
    if (smipper.cacheEntry) {
        smipper.cacheEntry.add(path, response);
    }
    return response;
}
