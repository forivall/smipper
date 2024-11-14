import { Frame } from "./types";
import { Smipper } from "./Smipper";
import { loadUri } from "./loadUri";
import { buildStackLine } from "./buildStackLine";
import fs from "fs";
import { rewriteOCA } from "./rewriteOCA";

export function processFrame(
    smipper: Smipper,
    functionName: string,
    url: string,
    line: number,
    column: number
): Promise<Frame & { oldName?: string } | string> {
    smipper.verbose("got frame", functionName, url, line, column);
    if (functionName.endsWith("@")) {
        functionName = functionName.substring(0, functionName.length - 1);
    }
    url = rewriteOCA(smipper, url);
    return new Promise((resolve) => {
        let newUrl: string, newLine: number, newColumn: number, newName: string | null;
        smipper.verbose("calling loadUri", url);
        if (!url.includes("://") && url[0] !== "/" && fs.existsSync(url)) {
            url = `file://${process.cwd()}/${url}`;
        }
        return loadUri(smipper, url)
            .then((smap) => {
                smipper.verbose("got map", url, Object.keys(smap));

                // it appears that we're supposed to reduce the column
                // number by 1 when we get this from jsc
                const pos = smap.originalPositionFor({ line, column: column - smipper.jsc });
                if (!pos.source) {
                    smipper.verbose("nothing here", pos);
                    throw new Error("Mapping not found");
                }

                // smc.sourceContentFor(pos.source);

                newName = pos.name;
                newUrl = pos.source;

                newLine = pos.line || 0;
                newColumn = pos.column || 0;
            })
            .catch((err: unknown) => {
                smipper.verbose("didn't get map", url, err);
                // console.error(err);
            })
            .finally(() => {
                if (smipper.json) {
                    const ret: Frame & { oldName?: string } = {
                        functionName: newName ? newName : functionName,
                        sourceURL: newUrl ? newUrl : url,
                        line: newUrl ? newLine : line,
                        column: newUrl ? newColumn : column
                    };
                    if (newName) {
                        ret.oldName = functionName;
                    }
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
                } else {
                    let str;
                    if (newUrl) {
                        str = `${buildStackLine(newName || functionName, newUrl, newLine, newColumn)}`;
                        if (!smipper.noOriginalUrl) {
                            str += ` (${buildStackLine(newName && functionName !== newName ? functionName : "", url, line, column)})`;
                        }
                    } else {
                        str = buildStackLine(functionName, url, line, column);
                    }
                    resolve(str);
                }
            });
    });
}
