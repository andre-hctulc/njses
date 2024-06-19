export class NotInitializedError extends Error {
    constructor(message?: string) {
        super(message ?? "Service not initialized");
    }
}
