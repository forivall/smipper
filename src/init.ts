import { Smipper } from "./Smipper";
import fs from "fs";
import os from "os";
import path from "path";
import { Cache } from "./Cache";

export function init(): Smipper {
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
    return smipper;
}
