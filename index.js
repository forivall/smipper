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
                // console.log("got shit", path, data.length);
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
    const arg = process.argv[i];
    // console.log("got arg", arg);
    if (arg === "-") {
        stack = fs.readFileSync("/dev/stdin").toString();
    } else if (arg.lastIndexOf("-f", 0) === 0) {
        stack = fs.readFileSync(arg.substr(2)).toString();
    } else if (arg.lastIndexOf("--file=", 0) === 0) {
        stack = fs.readFileSync(arg.substr(7)).toString();
    } else if (arg === "-h" || arg === "--help") {
        console.log("smip [stack|-h|--help|-f=@FILE@|-");
        process.exit(0);
    } else {
        stack = arg;
    }
}

Promise.all(stack.split("\n").filter(x => x).map(x => {
    const match = /([^ ]*@)?(.*):([0-9]+):([0-9]+)/.exec(x);
    if (!match) {
        const nolinecol = /([^ ]*)@(.*)/.exec(x);
        if (nolinecol) {
            return nolinecol[0];
        }
        // console.log("balls", x);
        return x;
    }

    return new Promise((resolve, reject) => {
        const functionName = match[1];
        let url = match[2];
        let line = parseInt(match[3]);
        let column = parseInt(match[4]);
        return loadUri(url + ".map").then((smap) => {
            // console.log("got map", Object.keys(smap));

            const pos = smap.originalPositionFor({ line, column });
            if (!pos.source) {
                // console.log("nothing here", pos);
                throw new Error("Mapping not found");
            }

            // smc.sourceContentFor(pos.source);

            url = pos.source;
            line = pos.line;
            column = pos.column;
        }).catch((err) => {
            // console.error(err);
        }).finally(() => {
            if (functionName) {
                resolve(`${functionName}@${url}:${line}:${column}`);
            } else {
                resolve(`${url}:${line}:${column}`);
            }
        });
    });
})).then((results) => {
    console.log(results);
}).catch((error) => {
    console.error("Got an error", error);
});

