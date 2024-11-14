import { Smipper } from "./Smipper";
import { processFrame } from "./processFrame";
import { Frame } from "./types";
import assert from "assert";
import { runJSON } from "./runJSON";

export async function run(smipper: Smipper): Promise<string> {
    if (smipper.json) {
        return runJSON(smipper);
    }

    assert(smipper.stack !== undefined);
    return Promise.all(
        smipper.stack
            .split("\n")
            .filter((x) => x)
            .map((x) => {
                x = x.trim();
                let match = / *\bat\b *([^ ]*).* \(?([^ ]+):([0-9]+):([0-9]+)/.exec(x);
                if (!match) {
                    match = /(?:([^ ]+)(?: *\[|@))?(.*):([0-9]+):([0-9]+)/.exec(x);
                }
                smipper.verbose(x, " => ", match);
                if (!match) {
                    const nolinecol = /([^ ]*)(.*)/.exec(x);
                    if (nolinecol) {
                        return nolinecol[0];
                    }
                    return x;
                }
                return processFrame(
                    smipper,
                    match[1] || "",
                    match[2] || "",
                    parseInt(match[3] || ""),
                    parseInt(match[4] || "")
                );
            })
    )
        .then((results) => {
            if (!results.length) {
                throw new Error("Empty output");
            }
            return results.join("\n");
        })
        .catch((error) => {
            console.error("Got an error", error);
            process.exit(3);
        });
}
