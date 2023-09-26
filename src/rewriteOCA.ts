import { Smipper } from "./Smipper";
import { Rewrite } from "./Rewrite";

const rewrites: Rewrite[] = [
    {
        pattern: /https:\/\/[^/]*nflxso.net\/genc\/nrdp\/milo\/1.0.([0-9]+)-[A-Za-z0-9]*\/milo.prod.js/,
        replacement: [
            "https://build.dta.netflix.com/nrdp/milo/(branch=master&repoBuildNumber=",
            1,
            ")/dist/milo.prod.js"
        ]
    },
    {
        pattern: /https:\/\/[^/]*nflxso.net\/genc\/nrdp\/poby\/1.0.([0-9]+)-[A-Za-z0-9]*\/poby.prod.js/,
        replacement: [
            "https://build.dta.netflix.com/nrdp/poby/(branch=master&repoBuildNumber=",
            1,
            ")/dist/poby.prod.js"
        ]
    },
    {
        pattern: /https:\/\/[^/]*nflxso.net\/genc\/nrdp\/bogart\/1.0.([0-9]+)-[A-Za-z0-9]*\/index.release.js/,
        replacement: ["https://build.dta.netflix.com/nrdp/bogart/(repoBuildNumber=", 1, ")/dist/index.release.js"]
    },
    {
        pattern: /https:\/\/[^/]*nflxso.net\/genc\/nrdp\/bogart\/1.0.([0-9]+)-[A-Za-z0-9]*\/worker.release.js/,
        replacement: ["https://build.dta.netflix.com/nrdp/bogart/(repoBuildNumber=", 1, ")/dist/worker.release.js"]
    },
    {
        pattern: /https:\/\/[^/]*nflxso.net\/genc\/nrdp\/bogart\/1.0.([0-9]+)-[A-Za-z0-9]*\/animation.release.js/,
        replacement: ["https://build.dta.netflix.com/nrdp/bogart/(repoBuildNumber=", 1, ")/dist/animation.release.js"]
    }
];

export function rewriteOCA(smipper: Smipper, url: string): string {
    for (const rewrite of rewrites) {
        const match = rewrite.pattern.exec(url);
        smipper.verbose("Trying to match", url, "against", rewrite, "=>", match);
        if (match) {
            return rewrite.replacement
                .map((x: string | number) => (typeof x === "string" ? x : String(match[x])))
                .join("");
        }
    }
    return url;
}
