#!/usr/bin/env node
"use strict";

import fs from "fs";
import path from "path";
import sourceMap from "source-map";
import url from "url";
import os from "os";
import { Cache } from "./Cache";
import { Smipper } from "./Smipper";
import { loadUri } from "./loadUri";
import { buildStackLine } from "./buildStackLine";

let smipper: Smipper = {
    verbose: () => {},
    json: false,
    jsc: 0,
    cacheDir: path.join(os.homedir(), ".cache", "smipper", "cache"),
    cacheSize: 10,
    sourceMaps: {}
};

for (const key in process.env) {
    switch (key) {
        case "SMIPPER_CACHE_KEY":
            smipper.cacheKey = process.env[key];
            break;
        case "SMIPPER_CACHE_SIZE":
            smipper.cacheSize = process.env[key] ? parseInt(process.env[key] || "") : 0;
            break;
        case "SMIPPER_CACHE_DIR":
            smipper.cacheDir = process.env[key] || "";
            break;
        case "SMIPPER_VERBOSE": {
            const val = process.env[key];
            if (val && val !== "false" && val !== "0") {
                smipper.verbose = console.error.bind(console);
            }
            break;
        }
    }
}

const usage =
    "smipper [stack|-h|--help|-v|--verbose|--version|--jsc|--json|--file=@FILE@|-f=@FILE@|--cache-key=$CACHE_KEY$|--cache-dir=$CACHE_DIR$|--cache-size=$CACHE_SIZE$|-";

for (let i = 2; i < process.argv.length; ++i) {
    try {
        const arg = process.argv[i] || "";
        smipper.verbose("got arg", arg);

        if (arg === "-f" || arg === "--file") {
            smipper.stack = fs.readFileSync(process.argv[++i]).toString();
        } else if (arg.startsWith("-f")) {
            smipper.stack = fs.readFileSync(arg.substring(2)).toString();
        } else if (arg.startsWith("--file=")) {
            smipper.stack = fs.readFileSync(arg.substring(7)).toString();
        } else if (arg === "--verbose" || arg === "-v") {
            smipper.verbose = console.error.bind(console);
        } else if (arg === "--version") {
            console.log(JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version);
            process.exit(0);
        } else if (arg === "--json") {
            smipper.json = true;
        } else if (arg === "--cache-key") {
            smipper.cacheKey = process.argv[++i] || "";
        } else if (arg.startsWith("--cache-key=")) {
            smipper.cacheKey = arg.substring(12);
        } else if (arg === "--cache-size") {
            smipper.cacheSize = parseInt(String(process.argv[++i]));
        } else if (arg.startsWith("--cache-size=")) {
            smipper.cacheSize = parseInt(arg.substring(13));
        } else if (arg === "--cache-dir") {
            smipper.cacheDir = String(process.argv[++i]);
        } else if (arg.startsWith("--cache-dir=")) {
            smipper.cacheDir = arg.substring(12);
        } else if (arg === "--jsc") {
            // jsc has the wrong column for some reason
            smipper.jsc = 1;
        } else if (arg === "-h" || arg === "--help") {
            console.log(usage);
            process.exit(0);
        } else if (arg === "-") {
            // stdin
        } else {
            smipper.stack = arg;
        }
    } catch (err: unknown) {
        console.error("Error: " + (err as Error).toString());
        process.exit(1);
    }
}

if (isNaN(smipper.cacheSize)) {
    console.error(usage);
    process.exit(1);
}

if (smipper.cacheKey) {
    smipper.cache = new Cache(smipper);
}

if (!smipper.stack) {
    smipper.stack = fs.readFileSync("/dev/stdin").toString();
    if (!smipper.stack) {
        console.error("Nothing to do");
        process.exit(0);
    }
}

type Frame = {
    functionName: string;
    sourceURL: string;
    line: number;
    column: number;
    index?: number;
};

function processFrame(functionName: string, url: string, line: number, column: number): Promise<Frame | string> {
    if (smipper.verbose) {
        console.error("got frame", functionName, url, line, column);
    }
    if (functionName.endsWith("@")) {
        functionName = functionName.substring(0, functionName.length - 1);
    }
    return new Promise((resolve) => {
        let newUrl: string, newLine: number, newColumn: number;
        smipper.verbose("calling loadUri", url);
        if (!url.includes("://") && url[0] !== "/" && fs.existsSync(url)) {
            url = `file://${process.cwd()}/${url}`;
        }
        return loadUri(smipper, url)
            .then((smap) => {
                smipper.verbose("got map", url, Object.keys(smap));

                // it appears that we're supposed to reduce the column
                // number by 1 when we get this from jsc
                const pos = smap.originalPositionFor({ line, column: column - smipper.jsc });
                if (!pos.source) {
                    smipper.verbose("nothing here", pos);
                    throw new Error("Mapping not found");
                }

                // smc.sourceContentFor(pos.source);

                newUrl = pos.source;

                newLine = pos.line || 0;
                newColumn = pos.column || 0;
            })
            .catch((err: unknown) => {
                smipper.verbose("didn't get map", url, err);
                // console.error(err);
            })
            .finally(() => {
                if (smipper.json) {
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
                        str = `${buildStackLine(functionName, newUrl, newLine, newColumn)} (${buildStackLine(
                            "",
                            url,
                            line,
                            column
                        )})`;
                    } else {
                        str = buildStackLine(functionName, url, line, column);
                    }
                    resolve(str);
                }
            });
    });
}

if (smipper.json) {
    let parsed;
    try {
        parsed = JSON.parse(smipper.stack);
        if (!Array.isArray(parsed)) {
            throw new Error("Expected array");
        }
    } catch (err) {
        console.error(`Can't parse json ${err}`);
        process.exit(1);
    }
    Promise.all(
        parsed.map((frame) => {
            smipper.verbose("got frame frame", frame);
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
        smipper.stack
            .split("\n")
            .filter((x) => x)
            .map((x) => {
                x = x.trim();
                let match = / *at *([^ ]*).* \(?([^ ]+):([0-9]+):([0-9]+)/.exec(x);
                if (!match) {
                    match = /([^ ]+@)?(.*):([0-9]+):([0-9]+)/.exec(x);
                }
                smipper.verbose(x, " => ", match);
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
