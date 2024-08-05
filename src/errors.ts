export class NJSESError extends Error {
    static message(message: string, tags?: string[]) {
        return `NJSES Error ${tags?.length ? "(" + tags.join(", ") + ")" : ""}: ${message}`;
    }

    constructor(message: string, readonly cause?: unknown, readonly tags: string[] = []) {
        super(message);
    }

    toString() {
        return NJSESError.message(this.message, this.tags);
    }

    hasTag(tag: string) {
        return this.tags.includes(tag);
    }
}
