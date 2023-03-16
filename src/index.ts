#!/usr/bin/env node
"use strict";

import { Smipper } from "./Smipper";
import { init } from "./init";
import { run } from "./run";

const smipper: Smipper = init();

if (smipper.stack === undefined) {
    console.error("Nothing to smip");
    process.exit(1);
}

run(smipper)
    .then((output: string) => {
        console.log(output);
        if (smipper.cacheEntry) {
            smipper.verbose("Writing cache entry");
            smipper.cacheEntry.write();
        }
        process.exit(0);
    })
    .catch((error: unknown) => {
        console.error((error as Error).message);
        process.exit(2);
    });
