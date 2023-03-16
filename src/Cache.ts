import * as fs from "fs";
import * as path from "path";
import { Smipper } from "./Smipper";

export class CacheEntry {
    private key: string;
    private smipper: Smipper;
    private entries: Map<string, string>;
    private trim: () => void;

    constructor(key: string, smipper: Smipper, trim: () => void) {
        this.key = key;
        this.smipper = smipper;
        this.entries = new Map();
        this.trim = trim;
    }

    add(url: string, contents: string): void {
        this.entries.set(url, contents);
    }

    write(): void {
        if (!this.entries.size) {
            return;
        }
        const tempdir = fs.mkdtempSync(this.smipper.cacheDir);
        try {
            for (const [url, contents] of this.entries) {
                const encoded = encodeURIComponent(url);
                fs.writeFileSync(path.join(tempdir, encoded), contents);
            }
            const dest = path.join(this.smipper.cacheDir, encodeURIComponent(this.key));
            fs.renameSync(tempdir, dest);
            this.smipper.verbose("Moved", this.entries.keys(), "from", tempdir, "to", dest);
            this.trim();
        } catch (err: unknown) {
            this.smipper.verbose("Got error writing file(s)", err);
            fs.rmSync(tempdir, { recursive: true, force: true });
        }
    }
}

export class Cache {
    private readonly smipper: Smipper;

    constructor(smipper: Smipper) {
        this.smipper = smipper;
        this.smipper.verbose("Created cache", this.smipper.cacheDir, this.smipper.cacheSize);
        if (!fs.existsSync(smipper.cacheDir)) {
            fs.mkdirSync(smipper.cacheDir, { recursive: true });
        } else {
            this.trim();
        }
    }

    private trim(): void {
        try {
            const dirs = fs
                .readdirSync(this.smipper.cacheDir, { withFileTypes: true })
                .filter((x: fs.Dirent) => x.isDirectory() && x.name.startsWith("smipper:"))
                .map((x: fs.Dirent) => path.join(this.smipper.cacheDir, x.name))
                .sort((l: string, r: string) => fs.statSync(l).mtimeMs - fs.statSync(r).mtimeMs);
            this.smipper.verbose("trim", this.smipper.cacheDir, this.smipper.cacheSize, "=>", dirs);
            while (dirs.length > this.smipper.cacheSize) {
                const dir = dirs[0] || "";
                this.smipper.verbose("removing directory", dir);
                fs.rmSync(dir, { recursive: true, force: true });
                dirs.shift();
            }
        } catch (err: unknown) {
            /* */
        }
    }

    get(key: string, url: string): string | undefined {
        const file = path.join(this.smipper.cacheDir, encodeURIComponent(key), encodeURIComponent(url));
        try {
            return fs.readFileSync(file, "utf8");
        } catch (err: unknown) {
            this.smipper.verbose("Failed to read file", file, err);
            return undefined;
        }
    }

    create(key: string): CacheEntry {
        return new CacheEntry(key, this.smipper, this.trim.bind(this));
    }
}
