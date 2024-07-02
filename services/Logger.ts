import { Service } from "../decorators";
import { Shadow } from "../shadow";

type LogLevel = "all" | "verbose" | "silent" | "important";

@Service({ name: "$$Logger" })
export class Logger {
    private _level: LogLevel = (process.env.development === "development"
        ? "verbose"
        : "important") as LogLevel;

    constructor() {}

    setLevel(level: LogLevel) {
        this._level = level;
    }

    get level() {
        return this._level;
    }

    private _message(messages: any[]): any[] {
        const labels = ["{{ NJSES }}"];
        // If first arg given is a service, add a service label and remove it from the messages
        if (messages[0]) {
            const shadow = Shadow.get(messages[0]);
            if (shadow) {
                labels.push(`++ Service '${shadow.name}' ++`);
                messages.shift();
            }
        }
        return [...labels, ...messages];
    }

    levelLog(level: Exclude<LogLevel, "silent">, ...messages: any) {
        if (this._levelMatches(level)) return console.log(...this._message(messages));
    }

    levelError(level: Exclude<LogLevel, "silent">, ...messages: any) {
        if (this._levelMatches(level)) return console.error(...this._message(messages));
    }

    levelWarn(level: Exclude<LogLevel, "silent">, ...messages: any) {
        if (this._levelMatches(level)) return console.warn(...this._message(messages));
    }

    log(...messages: any) {
        this.levelLog("important", ...messages);
    }

    error(...messages: any) {
        this.levelError("important", ...messages);
    }

    warn(...messages: any) {
        this.levelWarn("important", ...messages);
    }

    devLog(...messages: any) {
        if (process.env.NODE_ENV !== "development") return;
        this.log(...messages);
    }

    devError(...messages: any) {
        if (process.env.NODE_ENV !== "development") return;
        this.error(...messages);
    }

    devWarn(...messages: any) {
        if (process.env.NODE_ENV !== "development") return;
        this.warn(...messages);
    }

    private _levelMatches(level: Exclude<LogLevel, "silent">) {
        if (this.level === "all") return true;
        if (level === "verbose" && this.level === "verbose") return true;
        if (level === "important" && (this.level === "important" || this.level === "verbose")) return true;
        return false;
    }
}
