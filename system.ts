export function randomId() {
    return Math.random().toString(36).slice(2);
}

export enum FIELD_NAME {
    INIT = "$$init",
    CONFIGURE = "$$configure",
    MOUNT = "$$mount",
    STORE_GET = "$$store_get",
    STORE_SET = "$$store_set",
    STORE_GET_ALL = "$$store_get_all",
    FACTORY = "$$factory",
}
