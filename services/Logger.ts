import { Service } from "../decorators";
import { Shadow } from "../shadow";

type LogSeverity = "all" | "verbose" | "silent" | "important";

@Service({ name: "$Logger" })
export class Logger {
    /** `process.env.NJSES_LOGS || (process.env.development === "development" ? "verbose" : "important")` */
    readonly severity: LogSeverity = (process.env.development === "development"
        ? "verbose"
        : "important") as LogSeverity;

    constructor() {
        if (process.env.NJSES_LOGS) {
            if (["all", "verbose", "silent", "important"].includes(process.env.NJSES_LOGS as string))
                this.severity = process.env.NJSES_LOGS as LogSeverity;
        }
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

    severeLog(severity: Exclude<LogSeverity, "silent">, ...messages: any) {
        if (this._severityMatches(severity)) return console.log(...this._message(messages));
    }

    severeError(severity: Exclude<LogSeverity, "silent">, ...messages: any) {
        if (this._severityMatches(severity)) return console.error(...this._message(messages));
    }

    severeWarn(severity: Exclude<LogSeverity, "silent">, ...messages: any) {
        if (this._severityMatches(severity)) return console.warn(...this._message(messages));
    }

    log(...messages: any) {
        this.severeLog("important", ...messages);
    }

    error(...messages: any) {
        this.severeError("important", ...messages);
    }

    warn(...messages: any) {
        this.severeWarn("important", ...messages);
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

    private _severityMatches(severity: Exclude<LogSeverity, "silent">) {
        if (this.severity === "all") return true;
        if (severity === "verbose" && this.severity === "verbose") return true;
        if (severity === "important" && (this.severity === "important" || this.severity === "verbose"))
            return true;
        return false;
    }
}
