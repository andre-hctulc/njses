export function randomId() {
    return Math.random().toString(36).slice(2);
}

/**
 * @param d1
 * @param d2 Overwrites _d1_!
 */
export function merge(d1: any, d2: any) {
    if (d1 instanceof Set) {
        return new Set([...d1, ...d2]);
    }
    if (d1 instanceof Map) {
        return new Map([...d1, ...d2]);
    }
    if (Array.isArray(d1)) {
        return [...d1, ...d2];
    } else if (d1 && typeof d1 === "object") {
        return { ...d1, ...d2 };
    } else {
        return d2;
    }
}
