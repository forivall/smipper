import fs from "fs";
import path from "path";
import { Smipper } from "./Smipper";

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

export function rewriteLocalControl(smipper: Smipper, url: string): string {
    let file = path.basename(url.substring(6));
    const q = file.indexOf("?");
    if (q !== -1) {
        file = file.substring(0, q);
    }
    const found = findFile(process.cwd(), file);
    smipper.verbose(`Rewriting ${url} in ${process.cwd()} (${file}) => ${found}`);
    if (found) {
        return found;
    }
    throw new Error("Couldn't resolve localcontrol " + url);
}
