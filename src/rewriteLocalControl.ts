import fs from "fs";
import path from "path";

function findFile(dir: string, fn: string): string | undefined {
    const list = fs.readdirSync(dir);
    for (let file of list) {
        const match = file === fn;
        file = dir + "/" + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            const ret = findFile(file, fn);
            if (ret) {
                return ret;
            }
        } else if (match) {
            return "file://" + file;
        }
    }
    return undefined;
}

export function rewriteLocalControl(url: string): string {
    const found = findFile(process.cwd(), path.basename(url.substring(6)));
    if (found) {
        return found;
    }
    throw new Error("Couldn't resolve localcontrol " + url);
}
