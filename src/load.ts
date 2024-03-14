import { Smipper } from "./Smipper";
import { rewriteLocalControl } from "./rewriteLocalControl";
import fs from "fs";
import got from "got";
import path from "path";
import process from "process";
import assert from "assert";

export async function load(smipper: Smipper, filePath: string): Promise<string> {
    smipper.verbose("load", filePath);
    if (filePath.startsWith("http://localcontrol.netflix.com/")) {
        filePath = rewriteLocalControl(smipper, filePath);
    }

    smipper.verbose(smipper.mappedUrls);
    const mapped = smipper.mappedUrls.get(filePath);
    if (mapped) {
        try {
            const ret = fs.readFileSync(mapped, "utf8");
            smipper.verbose("Loaded mapped url", filePath, mapped, "=>", ret.length);
            return ret;
        } catch (err: unknown) {
            assert(err instanceof Error);
            smipper.verbose("Failed to load mapped url", filePath, mapped, err.message);
            smipper.mappedUrls.delete(filePath);
        }
    }

    if (!filePath.includes("://")) {
        if (filePath[0] === "/" && fs.existsSync(filePath)) {
            filePath = `file://${filePath}`;
        } else if (fs.existsSync(filePath)) {
            filePath = `file://${path.join(process.cwd(), filePath)}`;
        } else {
            filePath = rewriteLocalControl(smipper, filePath);
        }
    }

    if (filePath.startsWith("file:///")) {
        return fs.readFileSync(filePath.substring(7), "utf8");
    }

    if (!filePath.startsWith("http://") && !filePath.startsWith("https://")) {
        throw new Error("Not a url");
    }

    if (smipper.cache && smipper.cacheKey) {
        const response = smipper.cache.get(smipper.cacheKey, filePath);
        if (response) {
            return response;
        }
        if (!smipper.cacheEntry) {
            smipper.cacheEntry = smipper.cache.create(smipper.cacheKey);
        }
    }

    // let retryIndex = 0;
    async function get(): Promise<string> {
        const response = await got.get(filePath, { timeout: 10000 });
        smipper.verbose(response.headers);
        return response.body || "";
    }

    const response = await get();
    if (smipper.cacheEntry) {
        smipper.cacheEntry.add(filePath, response);
    }
    return response;
}
