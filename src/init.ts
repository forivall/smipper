import { Smipper } from "./Smipper";
import fs from "fs";
import os from "os";
import path from "path";
import assert from "assert";
import { Cache } from "./Cache";

export function init(): Smipper {
    let smipper: Smipper = {
        verbose: () => {},
        json: false,
        jsc: 0,
        cacheDir: path.join(os.homedir(), ".cache", "smipper", "cache"),
        cacheSize: 10,
        sourceMaps: new Map(),
        noOriginalUrl: false,
        mappedUrls: new Map()
    };

    const addMapUrl = (arg: string): void => {
        arg.split(" ").forEach((x: string, idx: number) => {
            const split = x.split("=>");
            if (split.length !== 2 || !split[0] || !split[1]) {
                throw new Error(`Failed to parse map url: ${arg} ${idx}`);
            }
            smipper.mappedUrls.set(split[0], split[1]);
        });
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
            case "SMIPPER_NO_ORIGINAL_URL": {
                const val = process.env[key];
                if (val && val !== "false" && val !== "0") {
                    smipper.noOriginalUrl = true;
                }
                break;
            }
        }
    }

    const usage =
        "smipper [stack|-h|--help|-v|--verbose|--version|--jsc|--json|--file=@FILE@|-f=@FILE@|--cache-key=$CACHE_KEY$|--cache-dir=$CACHE_DIR$|--cache-size=$CACHE_SIZE$|--no-original-url|-n|--map-url|-m|-";

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
                console.log(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version);
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
            } else if (arg === "--jsc" || arg === "--sm" || arg === "--spidermonkey" || arg === "--moz") {
                // jsc and spidermonkey have the wrong column for some reason
                smipper.jsc = 1;
            } else if (arg === "-h" || arg === "--help") {
                console.log(usage);
                process.exit(0);
            } else if (arg === "--no-original-url" || arg == "-n") {
                smipper.noOriginalUrl = true;
            } else if (arg === "--map-url" || arg === "-m") {
                addMapUrl(process.argv[++i]);
            } else if (arg.startsWith("--map-url=")) {
                addMapUrl(arg.substring(10));
            } else if (arg === "-") {
                // stdin
            } else {
                smipper.stack = arg;
            }
        } catch (err: unknown) {
            assert(err instanceof Error);
            console.error("Error: " + err.toString());
            smipper.verbose(err.stack);
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
    return smipper;
}
