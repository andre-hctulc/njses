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
    DESTROY = "$$destroy",
    REPO_FIND = "$$repo_find_one",
    REPO_FIND_FIRST = "$$repo_find_first",
    REPO_FIND_MANY = "$$repo_find_many",
    REPO_CREATE = "$$repo_find_create",
    REPO_CREATE_MANY = "$$repo_create_may",
    REPO_DELETE = "$$repo_delete",
    REPO_DELETE_MANY = "$$repo_delete_many",
    REPO_UPDATE = "$$repo_update",
    REPO_UPDATE_MANY = "$$repo_update_many",
}

export enum ROLE_NAME {
    REPO = "$$repo",
}
