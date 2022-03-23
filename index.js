#!/usr/bin/env node
"use strict";

const fs = require("fs");
const got = require("got");
const sourceMap = require("source-map");
const url = require("url");
let verbose = false;
let stack;
let json = false;
let retries = 3;

function load(path)
{
    return new Promise((resolve, reject) => {
        if (path.startsWith("file:///")) {
            try {
                resolve(fs.readFileSync(path.substr(7), "utf8"));
            } catch (err) {
                reject(err);
            }
            return;
        }
        let retryIndex = 0;
        async function get()
        {
            try {
                const response = await got.get(path, { retry: { limit: retries } });
                return response.body;
            } catch (err) {
                reject(err);
            }
        }

        get().then(resolve, reject);
    });
}

const sourceMaps = {};
function loadUri(path) {
    if (path[0] === "/") {
        path = "file://" + path;
    }
    return new Promise((resolve, reject) => {
        if (verbose)
            console.log("loading", path);
        if (!(path in sourceMaps)) {
            sourceMaps[path] = {
                resolvers: [ resolve ],
                rejecters: [ reject  ]
            };
            load(path).then(jsData => {
                const idx = jsData.lastIndexOf("//# sourceMappingURL=");
                if (verbose)
                    console.error("Got the file", jsData.length, idx);
                if (idx == -1)
                    return path + ".map";

                const mapUrl = jsData.substr(idx + 21);
                if (mapUrl.indexOf("://") != -1) {
                    return mapUrl;
                }
                return (new url.URL(mapUrl, path)).href;
            }).then(mapUrl => {
                return load(mapUrl);
            }).then(sourceMapData => {
                const parsed = JSON.parse(sourceMapData);
                const smap = new sourceMap.SourceMapConsumer(parsed);
                const pending = sourceMaps[path];
                pending.resolvers.forEach(func => {
                    func(smap);
                });
            }).catch((err) => {
                const pending = sourceMaps[path];
                pending.rejecters.forEach(func => {
                    func(err);
                });
            });
        } else {
            const cur = sourceMaps[path];
            if (verbose)
                console.error("path is in source maps already", cur);
            cur.resolvers.push(resolve);
            cur.rejecters.push(reject);
        }
    });
}

let hasInput = false;
for (let i=2; i<process.argv.length; ++i) {
    try {
        const arg = process.argv[i];
        if (verbose)
            console.error("got arg", arg);
        if (arg === "-f" || arg === "--file") {
            stack = fs.readFileSync(process.argv[++i]).toString();
        } else if ( arg.startsWith("-f") === 0) {
            stack = fs.readFileSync(arg.substr(2)).toString();
        } else if (arg.startsWith("--file=") === 0) {
            stack = fs.readFileSync(arg.substr(7)).toString();
        } else if (arg === "--verbose" || arg === "-v") {
            verbose = true;
        } else if (arg === "--json") {
            json = true;
        } else if (arg.startsWith("--retries")) {
            retries = parseInt(arg.substr(9));
            if (isNaN(retries) || retries < 0) {
                console.error("smipper [stack|-h|--help|-v|--verbose|--retries=<number>|--json|-f=@FILE@|-");
                process.exit(1);
            }
        } else if (arg === "-h" || arg === "--help") {
            console.error("smipper [stack|-h|--help|-v|--verbose|--retries=<number>|--json|-f=@FILE@|-");
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

function processFrame(functionName, url, line, column)
{
    if (verbose)
        console.log("got frame", functionName, url, line, column);
    if (functionName.endsWith("@"))
        functionName = functionName.substr(0, functionName.length - 1);
    return new Promise((resolve, reject) => {
        let newUrl, newLine, newColumn;
        if (verbose)
            console.error("calling loadUri", url);
        if (!url.includes("://") && url[0] !== "/" && fs.existsSync(url)) {
            url = `file://${process.cwd()}/${url}`;
        }
        return loadUri(url).then((smap) => {
            if (verbose)
                console.error("got map", url, Object.keys(smap));

            // it appears that we're supposed to reduce the column
            // number by 1 when we get this from jsc
            --column;
            const pos = smap.originalPositionFor({ line, column });
            if (!pos.source) {
                if (verbose)
                    console.error("nothing here", pos);
                throw new Error("Mapping not found");
            }

            // smc.sourceContentFor(pos.source);

            newUrl = pos.source;
            newLine = pos.line;
            newColumn = pos.column;
        }).catch((err) => {
            if (verbose)
                console.error("didn't get map", url, err);
            // console.error(err);
        }).finally(() => {
            if (json) {
                const ret = {
                    functionName: functionName,
                    sourceURL: newUrl ? newUrl : url,
                    line: newUrl ? newLine : line,
                    column: newUrl ? newColumn : column
                };
                if (newUrl) {
                    ret.oldSourceURL = url;
                    ret.oldLine = line;
                    ret.oldColumn = column;
                }
                // if (newUrl) {
                //     ret.newUrl = newUrl;
                //     ret.newLine = newLine;
                //     ret.newColumn = newColumn;
                // }
                resolve(ret);
            } else {
                function build(functionName, url, line, column) {
                    return `${functionName ? "at " + functionName + " " : ""}${url}:${line}:${column}`;
                }
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
        if (!Array.isArray(parsed))
            throw new Error("Expected array");
    } catch (err) {
        console.error(`Can't parse json ${err}`);
        process.exit(1);
    }
    Promise.all(parsed.map((frame) => {
        if (verbose)
            console.error("got frame frame", frame);
        return processFrame(frame.functionName || "", frame.sourceURL || "", frame.line, frame.column);
    })).then((results) => {
        results.forEach((frame, index) => {
            frame.index = index;
        });
        // console.log("shit", results);
        console.log(JSON.stringify(results, null, 4));
    }).catch((error) => {
        console.error("Got an error", error);
        process.exit(2);
    });
} else {
    Promise.all(stack.split("\n").filter(x => x).map(x => {
        x = x.trim();
        let match = / *at *([^ ]*).* \(?([^ ]+):([0-9]+):([0-9]+)/.exec(x);
        if (!match) {
            match = /([^ ]+@)?(.*):([0-9]+):([0-9]+)/.exec(x);
        }
        if (verbose)
            console.error(x, " => ", match);
        if (!match) {
            const nolinecol = /([^ ]*)(.*)/.exec(x);
            if (nolinecol) {
                return nolinecol[0];
            }
            return x;
        }
        return processFrame(match[1] || "", match[2], parseInt(match[3]), parseInt(match[4]));
    })).then((results) => {
        if (!results.length) {
            throw new Error("Empty output");
        }
        results.forEach(str => {
            console.log(str);
        });
    }).catch((error) => {
        console.error("Got an error", error);
        process.exit(3);
    });
}
