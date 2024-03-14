import { Rejecter, SourceMapResolve } from "./types";
import { load } from "./load";
import { Smipper } from "./Smipper";
import assert from "assert";
import sourceMap from "source-map";

export function loadUri(smipper: Smipper, path: string): Promise<sourceMap.SourceMapConsumer> {
    if (path[0] === "/") {
        path = "file://" + path;
    }
    return new Promise((resolve: SourceMapResolve, reject: Rejecter) => {
        smipper.verbose("loading", path);
        if (!smipper.sourceMaps.has(path)) {
            smipper.sourceMaps.set(path, {
                resolvers: [resolve],
                rejecters: [reject]
            });
            load(smipper, path)
                .then((jsData: string) => {
                    const idx = jsData.lastIndexOf("//# sourceMappingURL=");
                    smipper.verbose("Got the file", jsData.length, idx);
                    if (idx == -1) {
                        return path + ".map";
                    }

                    const end = jsData.indexOf("\n", idx + 21);
                    const mapUrl = jsData.substring(idx + 21, end === -1 ? jsData.length : end);
                    const match = /^(data:.+\/.+;)base64,/.exec(mapUrl);
                    if (match) {
                        assert(match[1] !== undefined);
                        return mapUrl.substring(match[1].length);
                    }
                    if (mapUrl.indexOf("://") != -1) {
                        return mapUrl;
                    }
                    // console.log(mapUrl);
                    return new URL(mapUrl, path).href;
                })
                .then((mapUrl) => {
                    // console.log(mapUrl.substring(0, 20));
                    if (mapUrl.startsWith("base64,")) {
                        return Buffer.from(mapUrl.substring(7), "base64").toString();
                    }
                    return load(smipper, mapUrl);
                })
                .then(async (sourceMapData: string) => {
                    const parsed = JSON.parse(sourceMapData);
                    const smap: sourceMap.SourceMapConsumer = await new sourceMap.SourceMapConsumer(parsed);
                    const pending = smipper.sourceMaps.get(path);
                    // sourceMaps.delete(path);
                    if (pending) {
                        pending.resolvers.forEach((func: SourceMapResolve) => {
                            func(smap);
                        });
                    }
                })
                .catch((err) => {
                    const pending = smipper.sourceMaps.get(path);
                    if (!pending) {
                        throw new Error("Gotta have pending");
                    }
                    // sourceMaps.delete(path);
                    pending.rejecters.forEach((func: (err: Error) => void) => {
                        func(err);
                    });
                });
        } else {
            const cur = smipper.sourceMaps.get(path);
            smipper.verbose("path is in source maps already", cur);

            if (!cur) {
                throw new Error("Gotta have cur");
            }
            cur.resolvers.push(resolve);
            cur.rejecters.push(reject);
        }
    });
}
