#!/usr/bin/env node
"use strict";

const fs = require("fs");
const loader = require("path-loader");
const sourceMap = require("source-map");

const sourceMaps = {};
function loadUri(path) {
    return new Promise((resolve, reject) => {
        if (!(path in sourceMaps)) {
            sourceMaps[path] = {
                resolvers: [ resolve ],
                rejecters: [ reject  ]
            };
            loader.load(path).then((data) => {
                const parsed = JSON.parse(data);
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
            // console.log("here", cur);
            cur.resolvers.push(resolve);
            cur.rejecters.push(reject);
        }
    });
}

let stack;
for (let i=2; i<process.argv.length; ++i) {
    try {
        const arg = process.argv[i];
        // console.log("got arg", arg);
        if (arg === "-") {
            stack = fs.readFileSync("/dev/stdin").toString();
        } else if (arg === "-f" || arg === "--file") {
            stack = fs.readFileSync(process.argv[++i]).toString();
        } else if ( arg.lastIndexOf("-f", 0) === 0) {
            stack = fs.readFileSync(arg.substr(2)).toString();
        } else if (arg.lastIndexOf("--file=", 0) === 0) {
            stack = fs.readFileSync(arg.substr(7)).toString();
        } else if (arg === "-h" || arg === "--help") {
            console.log("smipper [stack|-h|--help|-f=@FILE@|-");
            process.exit(0);
        } else {
            stack = arg;
        }
    } catch (err) {
        console.error("Error: " + err.toString());
        process.exit(1);
    }
}

if (!stack) {
    console.log("Nothing to do");
    process.exit(0);
}
Promise.all(stack.split("\n").filter(x => x).map(x => {
    const idx = x.indexOf("UI_ENGINE(fatal): ");
    if (idx !== -1)
        x = x.substr(idx + 18);
    const match = /([^ ]*@)?(.*):([0-9]+):([0-9]+)/.exec(x);
    if (!match) {
        const nolinecol = /([^ ]*)@(.*)/.exec(x);
        if (nolinecol) {
            return nolinecol[0];
        }
        return x;
    }

    return new Promise((resolve, reject) => {
        const functionName = match[1];
        let url = match[2];
        let line = parseInt(match[3]);
        let column = parseInt(match[4]);
        let newUrl, newLine, newColumn;
        const mapUrl = url + ".map";
        // console.log("calling loadUri", mapUrl);
        return loadUri(mapUrl).then((smap) => {
            // console.log("got map", mapUrl, Object.keys(smap));

            const pos = smap.originalPositionFor({ line, column });
            if (!pos.source) {
                // console.log("nothing here", pos);
                throw new Error("Mapping not found");
            }

            // smc.sourceContentFor(pos.source);

            newUrl = pos.source;
            newLine = pos.line;
            newColumn = pos.column;
        }).catch((err) => {
            // console.log("didn't get map", mapUrl);
            // console.error(err);
        }).finally(() => {
            function build(functionName, url, line, column) {
                if (functionName) {
                    return `${functionName}@${url}:${line}:${column}`;
                } else {
                    return `${url}:${line}:${column}`;
                }
            }
            let str;
            if (newUrl) {
                str = `${build(functionName, newUrl, newLine, newColumn)} (${build(undefined, url, line, column)})`;
            } else {
                str = build(functionName, url, line, column);
            }
            resolve(str);
        });
    });
})).then((results) => {
    results.forEach(str => {
        console.log(str);
    });
}).catch((error) => {
    console.error("Got an error", error);
});

