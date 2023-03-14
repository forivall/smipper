#!/usr/bin/env node
"use strict";

import * as fs from "fs";
import * as got from "got";
import * as path from "path";
import * as sourceMap from "source-map";
import * as url from "url";

let verbose = false;
let stack;
let json = false;
let retries = 3;
let jsc = 0;

for (let i = 2; i < process.argv.length; ++i) {
    try {
        const arg = process.argv[i] || "";
        if (verbose) {
            console.error("got arg", arg);
        }
        if (arg === "-f" || arg === "--file") {
            stack = fs.readFileSync(process.argv[++i]).toString();
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

function build(functionName: string, url: string, line: number, column: number): string {
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

function load(path: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        if (path.startsWith("http://localcontrol.netflix.com/")) {
            try {
                path = rewriteLocalControl(path);
            } catch (err) {
                reject(err);
                return;
            }
        }

        if (path.startsWith("file:///")) {
            try {
                resolve(fs.readFileSync(path.substring(7), "utf8"));
            } catch (err) {
                reject(err);
            }
            return;
        }

        if (!path.startsWith("http://") && !path.startsWith("https://")) {
            reject(new Error("Not a url"));
            return;
        }

        // let retryIndex = 0;
        async function get(): Promise<string> {
            const response = await got.get(path, { timeout: 10000 });
            console.log(response.headers);
            return response.body || "";
        }

        get().then(resolve, reject);
    });
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
    return new Promise((resolve: SourceMapResolve, reject: Rejecter) => {
        if (verbose) {
            console.log("loading", path);
        }
        if (!(path in sourceMaps)) {
            sourceMaps[path] = {
                resolvers: [resolve],
                rejecters: [reject]
            };
            load(path)
                .then((jsData: string) => {
                    const idx = jsData.lastIndexOf("//# sourceMappingURL=");
                    if (verbose) {
                        console.error("Got the file", jsData.length, idx);
                    }
                    if (idx == -1) {
                        return path + ".map";
                    }

                    const mapUrl = jsData.substring(idx + 21);
                    const match = /^(data:.+\/.+;)base64,/.exec(mapUrl);
                    if (match) {
                        return mapUrl.substring(match[1].length);
                    }
                    if (mapUrl.indexOf("://") != -1) {
                        return mapUrl;
                    }
                    // console.log(mapUrl);
                    return new url.URL(mapUrl, path).href;
                })
                .then((mapUrl) => {
                    // console.log(mapUrl.substring(0, 20));
                    if (mapUrl.startsWith("base64,")) {
                        return Buffer.from(mapUrl.substring(7), "base64").toString();
                    }
                    return load(mapUrl);
                })
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
                    const pending = sourceMaps[path];
                    if (!pending) {
                        throw new Error("Gotta have pending");
                    }
                    // sourceMaps.delete(path);
                    pending.rejecters.forEach((func: (err: Error) => void) => {
                        func(err);
                    });
                });
        } else {
            const cur = sourceMaps[path];
            if (verbose) {
                console.error("path is in source maps already", cur);
            }

            if (!cur) {
                throw new Error("Gotta have cur");
            }
            cur.resolvers.push(resolve);
            cur.rejecters.push(reject);
        }
    });
}

type Frame = {
    functionName: string;
    sourceURL: string;
    line: number;
    column: number;
    index?: number;
};

function processFrame(functionName: string, url: string, line: number, column: number): Promise<Frame | string> {
    if (verbose) {
        console.log("got frame", functionName, url, line, column);
    }
    if (functionName.endsWith("@")) {
        functionName = functionName.substring(0, functionName.length - 1);
    }
    return new Promise((resolve) => {
        let newUrl: string, newLine: number, newColumn: number;
        if (verbose) {
            console.error("calling loadUri", url);
        }
        if (!url.includes("://") && url[0] !== "/" && fs.existsSync(url)) {
            url = `file://${process.cwd()}/${url}`;
        }
        return loadUri(url)
            .then((smap) => {
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

                newLine = pos.line || 0;
                newColumn = pos.column || 0;
            })
            .catch((err) => {
                if (verbose) {
                    console.error("didn't get map", url, err);
                }
                // console.error(err);
            })
            .finally(() => {
                if (json) {
                    const ret = {
                        functionName: functionName,
                        sourceURL: newUrl ? newUrl : url,
                        line: newUrl ? newLine : line,
                        column: newUrl ? newColumn : column
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
                    resolve(ret);
                } else {
                    let str;
                    if (newUrl) {
                        str = `${build(functionName, newUrl, newLine, newColumn)} (${build("", url, line, column)})`;
                    } else {
                        str = build(functionName, url, line, column);
                    }
                    resolve(str);
                }
            });
    });
}

if (json) {
    let parsed;
    try {
        parsed = JSON.parse(stack);
        if (!Array.isArray(parsed)) {
            throw new Error("Expected array");
        }
    } catch (err) {
        console.error(`Can't parse json ${err}`);
        process.exit(1);
    }
    Promise.all(
        parsed.map((frame) => {
            if (verbose) {
                console.error("got frame frame", frame);
            }
            return processFrame(frame.functionName || "", frame.sourceURL || "", frame.line, frame.column);
        })
    )
        .then((results) => {
            results.forEach((frame: Frame | string, index: number) => {
                if (typeof frame !== "object") {
                    throw new Error("Huh?");
                }
                frame.index = index;
            });
            // console.log("shit", results);
            console.log(JSON.stringify(results, null, 4));
        })
        .catch((error) => {
            console.error("Got an error", error);
            process.exit(2);
        });
} else {
    Promise.all(
        stack
            .split("\n")
            .filter((x) => x)
            .map((x) => {
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
                return processFrame(match[1] || "", match[2], parseInt(match[3]), parseInt(match[4]));
            })
    )
        .then((results) => {
            if (!results.length) {
                throw new Error("Empty output");
            }
            results.forEach((str) => {
                console.log(str);
            });
        })
        .catch((error) => {
            console.error("Got an error", error);
            process.exit(3);
        });
}
