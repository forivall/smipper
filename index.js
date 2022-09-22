#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var fs = require("fs");
var got = require("got");
var path = require("path");
var sourceMap = require("source-map");
var url = require("url");
var verbose = false;
var stack;
var json = false;
var retries = 3;
var jsc = 0;
for (var i = 2; i < process.argv.length; ++i) {
    try {
        var arg = process.argv[i];
        if (verbose) {
            console.error("got arg", arg);
        }
        if (arg === "-f" || arg === "--file") {
            stack = fs.readFileSync(process.argv[++i]).toString();
        }
        else if (arg.startsWith("-f")) {
            stack = fs.readFileSync(arg.substring(2)).toString();
        }
        else if (arg.startsWith("--file=")) {
            stack = fs.readFileSync(arg.substring(7)).toString();
        }
        else if (arg === "--verbose" || arg === "-v") {
            verbose = true;
        }
        else if (arg === "--version") {
            console.log(JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version);
            process.exit(0);
        }
        else if (arg === "--json") {
            json = true;
        }
        else if (arg === "--jsc") {
            // jsc has the wrong column for some reason
            jsc = 1;
        }
        else if (arg.startsWith("--retries")) {
            retries = parseInt(arg.substring(9));
            if (isNaN(retries) || retries < 0) {
                console.error("smipper [stack|-h|--help|-v|--verbose|--version|--retries=<number>|--jsc|--json|-f=@FILE@|-");
                process.exit(1);
            }
        }
        else if (arg === "-h" || arg === "--help") {
            console.error("smipper [stack|-h|--help|-v|--verbose|--version|--retries=<number>|--jsc|--json|-f=@FILE@|-");
            process.exit(0);
        }
        else if (arg === "-") {
            // stdin
        }
        else {
            stack = arg;
        }
    }
    catch (err) {
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
function build(functionName, url, line, column) {
    return "".concat(functionName ? "at " + functionName + " " : "").concat(url, ":").concat(line, ":").concat(column);
}
function findFile(dir, fn) {
    var list = fs.readdirSync(dir);
    for (var _i = 0, list_1 = list; _i < list_1.length; _i++) {
        var file = list_1[_i];
        var match = file === fn;
        file = dir + "/" + file;
        var stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            var ret = findFile(file, fn);
            if (ret) {
                return ret;
            }
        }
        else if (match) {
            return "file://" + file;
        }
    }
    return undefined;
}
function rewriteLocalControl(url) {
    var found = findFile(process.cwd(), path.basename(url.substring(6)));
    if (found) {
        return found;
    }
    throw new Error("Couldn't resolve localcontrol " + url);
}
function load(path) {
    return new Promise(function (resolve, reject) {
        if (path.startsWith("http://localcontrol.netflix.com/")) {
            try {
                path = rewriteLocalControl(path);
            }
            catch (err) {
                reject(err);
                return;
            }
        }
        if (path.startsWith("file:///")) {
            try {
                resolve(fs.readFileSync(path.substring(7), "utf8"));
            }
            catch (err) {
                reject(err);
            }
            return;
        }
        if (!path.startsWith("http://") && !path.startsWith("https://")) {
            reject(new Error("Not a url"));
            return;
        }
        var retryIndex = 0;
        function get() {
            return __awaiter(this, void 0, void 0, function () {
                var response, err_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, got.get(path)];
                        case 1:
                            response = _a.sent();
                            return [2 /*return*/, response.body];
                        case 2:
                            err_1 = _a.sent();
                            reject(err_1);
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            });
        }
        get().then(resolve, reject);
    });
}
var sourceMaps = {};
function loadUri(path) {
    if (path[0] === "/") {
        path = "file://" + path;
    }
    return new Promise(function (resolve, reject) {
        if (verbose) {
            console.log("loading", path);
        }
        if (!(path in sourceMaps)) {
            sourceMaps[path] = {
                resolvers: [resolve],
                rejecters: [reject]
            };
            load(path)
                .then(function (jsData) {
                var idx = jsData.lastIndexOf("//# sourceMappingURL=");
                if (verbose) {
                    console.error("Got the file", jsData.length, idx);
                }
                if (idx == -1) {
                    return path + ".map";
                }
                var mapUrl = jsData.substring(idx + 21);
                var match = /^(data:.+\/.+;)base64,/.exec(mapUrl);
                if (match) {
                    return mapUrl.substring(match[1].length);
                }
                if (mapUrl.indexOf("://") != -1) {
                    return mapUrl;
                }
                // console.log(mapUrl);
                return new url.URL(mapUrl, path).href;
            })
                .then(function (mapUrl) {
                // console.log(mapUrl.substring(0, 20));
                if (mapUrl.startsWith("base64,")) {
                    return Buffer.from(mapUrl.substring(7), "base64").toString();
                }
                return load(mapUrl);
            })
                .then(function (sourceMapData) {
                var parsed = JSON.parse(sourceMapData);
                var smap = new sourceMap.SourceMapConsumer(parsed);
                var pending = sourceMaps[path];
                pending.resolvers.forEach(function (func) {
                    func(smap);
                });
            })["catch"](function (err) {
                var pending = sourceMaps[path];
                pending.rejecters.forEach(function (func) {
                    func(err);
                });
            });
        }
        else {
            var cur = sourceMaps[path];
            if (verbose) {
                console.error("path is in source maps already", cur);
            }
            cur.resolvers.push(resolve);
            cur.rejecters.push(reject);
        }
    });
}
function processFrame(functionName, url, line, column) {
    if (verbose) {
        console.log("got frame", functionName, url, line, column);
    }
    if (functionName.endsWith("@")) {
        functionName = functionName.substring(0, functionName.length - 1);
    }
    return new Promise(function (resolve) {
        var newUrl, newLine, newColumn;
        if (verbose) {
            console.error("calling loadUri", url);
        }
        if (!url.includes("://") && url[0] !== "/" && fs.existsSync(url)) {
            url = "file://".concat(process.cwd(), "/").concat(url);
        }
        return loadUri(url)
            .then(function (smap) {
            if (verbose) {
                console.error("got map", url, Object.keys(smap));
            }
            // it appears that we're supposed to reduce the column
            // number by 1 when we get this from jsc
            var pos = smap.originalPositionFor({ line: line, column: column - jsc });
            if (!pos.source) {
                if (verbose) {
                    console.error("nothing here", pos);
                }
                throw new Error("Mapping not found");
            }
            // smc.sourceContentFor(pos.source);
            newUrl = pos.source;
            newLine = pos.line;
            newColumn = pos.column;
        })["catch"](function (err) {
            if (verbose) {
                console.error("didn't get map", url, err);
            }
            // console.error(err);
        })["finally"](function () {
            if (json) {
                var ret = {
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
            }
            else {
                var str = void 0;
                if (newUrl) {
                    str = "".concat(build(functionName, newUrl, newLine, newColumn), " (").concat(build("", url, line, column), ")");
                }
                else {
                    str = build(functionName, url, line, column);
                }
                resolve(str);
            }
        });
    });
}
if (json) {
    var parsed = void 0;
    try {
        parsed = JSON.parse(stack);
        if (!Array.isArray(parsed)) {
            throw new Error("Expected array");
        }
    }
    catch (err) {
        console.error("Can't parse json ".concat(err));
        process.exit(1);
    }
    Promise.all(parsed.map(function (frame) {
        if (verbose) {
            console.error("got frame frame", frame);
        }
        return processFrame(frame.functionName || "", frame.sourceURL || "", frame.line, frame.column);
    }))
        .then(function (results) {
        results.forEach(function (frame, index) {
            if (typeof frame !== "object") {
                throw new Error("Huh?");
            }
            frame.index = index;
        });
        // console.log("shit", results);
        console.log(JSON.stringify(results, null, 4));
    })["catch"](function (error) {
        console.error("Got an error", error);
        process.exit(2);
    });
}
else {
    Promise.all(stack
        .split("\n")
        .filter(function (x) { return x; })
        .map(function (x) {
        x = x.trim();
        var match = / *at *([^ ]*).* \(?([^ ]+):([0-9]+):([0-9]+)/.exec(x);
        if (!match) {
            match = /([^ ]+@)?(.*):([0-9]+):([0-9]+)/.exec(x);
        }
        if (verbose) {
            console.error(x, " => ", match);
        }
        if (!match) {
            var nolinecol = /([^ ]*)(.*)/.exec(x);
            if (nolinecol) {
                return nolinecol[0];
            }
            return x;
        }
        return processFrame(match[1] || "", match[2], parseInt(match[3]), parseInt(match[4]));
    }))
        .then(function (results) {
        if (!results.length) {
            throw new Error("Empty output");
        }
        results.forEach(function (str) {
            console.log(str);
        });
    })["catch"](function (error) {
        console.error("Got an error", error);
        process.exit(3);
    });
}
