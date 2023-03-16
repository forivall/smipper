import { Smipper } from "./Smipper";
import assert from "assert";
import { processFrame } from "./processFrame";
import { Frame } from "./types";

export async function runJSON(smipper: Smipper): Promise<string> {
    assert(smipper.json);
    let parsed;
    try {
        assert(typeof smipper.stack === "string");
        parsed = JSON.parse(smipper.stack);
        if (!Array.isArray(parsed)) {
            throw new Error("Expected array");
        }
    } catch (err: unknown) {
        throw new Error(`Can't parse json ${err}`);
    }
    try {
        const results = await Promise.all(
            parsed.map((frame) => {
                smipper.verbose("got frame frame", frame);
                return processFrame(smipper, frame.functionName || "", frame.sourceURL || "", frame.line, frame.column);
            })
        );

        results.forEach((frame: Frame | string, index: number) => {
            if (typeof frame !== "object") {
                throw new Error("Huh?");
            }
            frame.index = index;
        });
        // console.log("shit", results);
        return JSON.stringify(results, null, 4);
    } catch (error: unknown) {
        throw new Error(`Got an error: ${(error as Error).message}`);
    }
}
