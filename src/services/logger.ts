import { Shadow } from "../shadow";
import type { ServiceInstance } from "../service-registery";
import { Service } from "../decorators";

type LogLevel = "all" | "verbose" | "important" | "silent";

export type LogOptions = {
    /** @default "important" */
    level?: LogLevel;
    devOnly?: boolean;
    service?: ServiceInstance;
};

const OPTIONS_SYMBOL = Symbol.for("njses_log_options_symbol");

@Service({ name: "$$Logger" })
export class Logger {
    private _level: LogLevel = (process.env.development === "development"
        ? "verbose"
        : "important") as LogLevel;

    setLevel(level: LogLevel) {
        this._level = level;
    }

    get level() {
        return this._level;
    }

    private _message(messages: any[], type: "log" | "error" | "warn"): void {
        const labels = ["[njses]"];
        const parts: string[] = [];

        for (const message of messages) {
            if (message && message[OPTIONS_SYMBOL]) {
                const opts: LogOptions = message[OPTIONS_SYMBOL];
                if (opts.devOnly && process.env.NODE_ENV !== "development") return;
                if (opts.level && !this._matchesLogLevel(opts.level)) return;
                if (opts.service) {
                    const shadow = Shadow.get(opts.service, true);
                    if (shadow)
                        labels.push(
                            `(Service ${shadow.namespace ? shadow.namespace + "/" : ""}${shadow.name})`
                        );
                }
            } else {
                parts.push(message);
            }
        }

        switch (type) {
            case "log":
                return console.log(...labels, ...parts);
            case "error":
                return console.error(...labels, ...parts);
            case "warn":
                return console.warn(...labels, ...parts);
        }
    }

    log(...messages: any) {
        this._message(messages, "log");
    }

    error(...messages: any) {
        this._message(messages, "error");
    }

    warn(...messages: any) {
        this._message(messages, "warn");
    }

    opts(logOptions: LogOptions) {
        return {
            ...logOptions,
            [OPTIONS_SYMBOL]: true,
        };
    }

    private _matchesLogLevel(level: LogLevel) {
        if (this.level === "silent") return false;
        if (this.level === "all") return true;
        if (level === "verbose" && this.level === "verbose") return true;
        if (level === "important" && (this.level === "important" || this.level === "verbose")) return true;
        return false;
    }
}
