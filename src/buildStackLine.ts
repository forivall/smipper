export function buildStackLine(functionName: string, url: string, line: number, column: number): string {
    return `${functionName ? "at " + functionName + " " : ""}${url}:${line}:${column}`;
}
