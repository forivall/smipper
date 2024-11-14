#!/usr/bin/env node
"use strict";

import * as fs from "fs";
import * as got from "got";
import * as path from "path";
import * as sourceMap from "source-map";
import * as url from "url";

let verbose = false;
let stack: string;
let json = false;
let retries = 3;
let jsc = 0;

for (let i = 2; i < process.argv.length; ++i) {
    try {
        const arg = process.argv[i]!;
        if (verbose) {
            console.error("got arg", arg);
        }
        if (arg === "-f" || arg === "--file") {
            ++i;
            if (i >= process.argv.length) {
                throw new Error("Missing file argument");
            }
            stack = fs.readFileSync(process.argv[i]!).toString();
        } else if (arg.startsWith("-f")) {
            stack = fs.readFileSync(arg.substring(2)).toString();
        } else if (arg.startsWith("--file=")) {
            stack = fs.readFileSync(arg.substring(7)).toString();
        } else if (arg === "--verbose" || arg === "-v") {
            verbose = true;
        } else if (arg === "--version") {
            console.log(JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version);
            process.exit(0);
        } else if (arg === "--json") {
            json = true;
        } else if (arg === "--jsc") {
            // jsc has the wrong column for some reason
            jsc = 1;
        } else if (arg.startsWith("--retries")) {
            retries = parseInt(arg.substring(9));
            if (isNaN(retries) || retries < 0) {
                console.error(
                    "smipper [stack|-h|--help|-v|--verbose|--version|--retries=<number>|--jsc|--json|-f=@FILE@|-"
                );
                process.exit(1);
            }
        } else if (arg === "-h" || arg === "--help") {
            console.error(
                "smipper [stack|-h|--help|-v|--verbose|--version|--retries=<number>|--jsc|--json|-f=@FILE@|-"
            );
            process.exit(0);
        } else if (arg === "-") {
            // stdin
        } else {
            stack = arg;
        }
    } catch (err) {
        console.error("Error: " + err.toString());
        process.exit(1);
    }
}

if (!stack) {
    stack = fs.readFileSync("/dev/stdin").toString();
    if (!stack) {
        console.error("Nothing to do");
        process.exit(0);
    }
}

function build({ functionName, sourceURL: url, line, column }: Frame): string {
    return `${functionName ? "at " + functionName + " " : ""}${url}:${line}:${column}`;
}

function findFile(dir: string, fn: string): string | undefined {
    const list = fs.readdirSync(dir);
    for (let file of list) {
        const match = file === fn;
        file = dir + "/" + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            const ret = findFile(file, fn);
            if (ret) {
                return ret;
            }
        } else if (match) {
            return "file://" + file;
        }
    }
    return undefined;
}

function rewriteLocalControl(url: string) {
    const found = findFile(process.cwd(), path.basename(url.substring(6)));
    if (found) {
        return found;
    }
    throw new Error("Couldn't resolve localcontrol " + url);
}

async function load(path: string): Promise<string> {
    const isLocalControl = path.startsWith("http://localcontrol.netflix.com/");
    if (isLocalControl) {
        path = rewriteLocalControl(path);
    }

    if (path.startsWith("file:///")) {
        try {
            return fs.readFileSync(path.substring(7), "utf8");
        } catch (err) {
            if (isLocalControl) {
                throw err;
            }
            path = rewriteLocalControl(path);
            return fs.readFileSync(path.substring(7), "utf8");
        }
    }

    if (!path.startsWith("http://") && !path.startsWith("https://")) {
        throw new Error("Not a url");
    }

    const response = await got.get(path);
    if (verbose) {
        console.error(response.headers);
    }
    return response.body;
}

type SourceMapResolve = (res: sourceMap.SourceMapConsumer) => void;
type Rejecter = (err: Error) => void;
type SourceMapData = {
    resolvers: SourceMapResolve[];
    rejecters: Rejecter[];
};
const sourceMaps: Record<string, SourceMapData> = {};
function loadUri(path: string): Promise<sourceMap.SourceMapConsumer> {
    if (path[0] === "/") {
        path = "file://" + path;
    }
    // inflight cache requests
    return new Promise((resolve: SourceMapResolve, reject: Rejecter) => {
        if (verbose) {
            console.log("loading", path);
        }
        if (!(path in sourceMaps)) {
            sourceMaps[path] = {
                resolvers: [resolve],
                rejecters: [reject]
            };
            return loadAndReadMapping(path)
                .then(async (sourceMapData: string) => {
                    const parsed = JSON.parse(sourceMapData);
                    const smap: sourceMap.SourceMapConsumer = await new sourceMap.SourceMapConsumer(parsed);
                    const pending = sourceMaps[path];
                    // sourceMaps.delete(path);
                    if (pending) {
                        pending.resolvers.forEach((func: SourceMapResolve) => {
                            func(smap);
                        });
                    }
                })
                .catch((err) => {
                    const pending = sourceMaps[path]!;
                    // sourceMaps.delete(path);
                    pending.rejecters.forEach((func: (err: Error) => void) => {
                        func(err);
                    });
                });
        } else {
            const cur = sourceMaps[path]!;
            if (verbose) {
                console.error("path is in source maps already", cur);
            }
            cur.resolvers.push(resolve);
            cur.rejecters.push(reject);
        }
    });
}
async function loadAndReadMapping(path: string): Promise<string> {
    let jsData: string | undefined;
    let idx = -1;
    try {
        jsData = await load(path);
        idx = jsData.lastIndexOf("//# sourceMappingURL=");
        if (verbose) {
            console.error("Got the file", jsData.length, idx);
        }
    } catch (err) {
        if (verbose) {
            console.error("No file, trying with <filename>.map", err);
        }
    }
    let mapUrl: string;
    if (!jsData || idx == -1) {
        mapUrl = path + ".map";
    } else {
        mapUrl = jsData.substring(idx + 21);
        const match = /^(data:.+\/.+;)base64,/.exec(mapUrl);
        if (match) {
            mapUrl = mapUrl.substring(match[1]!.length);
        } else if (mapUrl.indexOf("://") === -1) {
            mapUrl = new url.URL(mapUrl, path).href;
        }
        // console.log(mapUrl);
    }

    // console.log(mapUrl.substring(0, 20));
    if (mapUrl.startsWith("base64,")) {
        return Buffer.from(mapUrl.substring(7), "base64").toString();
    }
    return load(mapUrl);
}

type Frame = {
    functionName: string;
    sourceURL: string;
    line: number;
    column: number;
    index?: number;
};

async function processFrame(oldFrame: Frame): Promise<Frame> {
    let { functionName, sourceURL: url, line, column } = oldFrame;
    if (verbose) {
        console.log("got frame", functionName, url, line, column);
    }
    if (functionName.endsWith("@")) {
        functionName = functionName.substring(0, functionName.length - 1);
    }
    let newUrl = url,
        newLine: number | null = line,
        newColumn: number | null = column;
    if (verbose) {
        console.error("calling loadUri", url);
    }
    if (!url.includes("://") && url[0] !== "/" && fs.existsSync(url)) {
        url = `file://${process.cwd()}/${url}`;
    }
    try {
        const smap = await loadUri(url);
        if (verbose) {
            console.error("got map", url, Object.keys(smap));
        }

        // it appears that we're supposed to reduce the column
        // number by 1 when we get this from jsc
        const pos = smap.originalPositionFor({ line, column: column - jsc });
        if (!pos.source) {
            if (verbose) {
                console.error("nothing here", pos);
            }
            throw new Error("Mapping not found");
        }

        // smc.sourceContentFor(pos.source);
        newUrl = pos.source;
        if (pos.line) newLine = pos.line;
        if (pos.column) newColumn = pos.column;
    } catch (err) {
        if (verbose) {
            console.error("didn't get map", url, err);
        }
    }
    const ret: Frame = {
        functionName: functionName,
        sourceURL: newUrl,
        line: newLine,
        column: newColumn
    };
    // if (newUrl) {
    //     ret.oldSourceURL = url;
    //     ret.oldLine = line;
    //     ret.oldColumn = column;
    // }
    // if (newUrl) {
    //     ret.newUrl = newUrl;
    //     ret.newLine = newLine;
    //     ret.newColumn = newColumn;
    // }
    return ret;
}

function buildMappedFrame(oldFrame: Frame, newFrame: Frame) {
    if (oldFrame.sourceURL === newFrame.sourceURL) {
        return build(oldFrame);
    }
    return `${build(newFrame)} (${build({ ...oldFrame, functionName: "" })})`;
}

async function mainJson() {
    const parsed = JSON.parse(stack);
    if (!Array.isArray(parsed)) {
        throw new Error("Expected array");
    }
    const results = await Promise.all(
        parsed.map((frame) => {
            if (verbose) {
                console.error("got frame frame", frame);
            }
            return processFrame(frame);
        })
    );
    results.forEach((frame: Frame | string, index: number) => {
        if (typeof frame !== "object") {
            throw new Error("Huh?");
        }
        frame.index = index;
    });
    // console.log("shit", results);
    console.log(JSON.stringify(results, null, 4));
}

async function mainString() {
    const results = await Promise.all(
        stack
            .split("\n")
            .filter((x) => x)
            .map(async (x) => {
                x = x.trim();
                let match = / *at *([^ ]*).* \(?([^ ]+):([0-9]+):([0-9]+)/.exec(x);
                if (!match) {
                    match = /([^ ]+@)?(.*):([0-9]+):([0-9]+)/.exec(x);
                }
                if (verbose) {
                    console.error(x, " => ", match);
                }
                if (!match) {
                    const nolinecol = /([^ ]*)(.*)/.exec(x);
                    if (nolinecol) {
                        return nolinecol[0];
                    }
                    return x;
                }

                const frame = {
                    functionName: match[1] || "",
                    sourceURL: match[2] || "",
                    line: parseInt(match[3]!),
                    column: parseInt(match[4]!)
                };
                return buildMappedFrame(frame, await processFrame(frame));
            })
    );
    results.forEach((str) => {
        console.log(str);
    });
}

(json ? mainJson() : mainString()).catch((error) => {
    console.error("Got an error", error);
    process.exit(2);
});
