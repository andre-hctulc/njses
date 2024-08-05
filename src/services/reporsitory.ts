import {
    Create,
    CreateMany,
    Delete,
    DeleteMany,
    Find,
    FindFirst,
    FindMany,
    Service,
    Update,
    UpdateMany,
} from "../decorators";
import { ServiceInstance, Services } from "../service-registery";
import { Shadow } from "../shadow";
import { FIELD_NAME, ROLE_NAME } from "../utils/system";
import type { OP } from "../utils/system-types";

/**
 * A default interface for a repository.
 */
export interface RepoTemplate<I, Q, D> {
    find: Find<I, D>;
    findFirst: FindFirst<Q, D>;
    findMany: FindMany<Q, D>;
    create: Create<I, D>;
    createMany: CreateMany<I, D>;
    delete: Delete<I>;
    deleteMany: DeleteMany<I, Q>;
    update: Update<I, D>;
    updateMany: Update<Q, D>;
}

/**
 * Handles reporsitories.
 */
@Service({ name: "$$Reporsitory" })
export class Reporsitory {
    isRepo(service: ServiceInstance) {
        return Shadow.hasRole(service, ROLE_NAME.REPO);
    }

    find<I, D>(service: ServiceInstance, id: I): OP<D | null> {
        return Services.invoke<Find<I, D>>(service, FIELD_NAME.REPO_FIND, id);
    }

    findFirst<Q, D>(service: ServiceInstance, query: Q): OP<D | null> {
        return Services.invoke<FindFirst<Q, D>>(service, FIELD_NAME.REPO_FIND_FIRST, query);
    }

    findMany<Q, D>(service: ServiceInstance, query: Q): OP<D[]> {
        return Services.invoke<FindMany<Q, D>>(service, FIELD_NAME.REPO_FIND_MANY, query);
    }

    create<I, D>(service: ServiceInstance, data: Partial<D>): OP<I> {
        return Services.invoke<Create<I, D>>(service, FIELD_NAME.REPO_CREATE, data);
    }

    createMany<I, D>(service: ServiceInstance, data: Partial<D>[]): OP<I[]> {
        return Services.invoke<CreateMany<I, D>>(service, FIELD_NAME.REPO_CREATE_MANY, data);
    }

    delete<I>(service: ServiceInstance, id: I): OP<void> {
        return Services.invoke<Delete<I>>(service, FIELD_NAME.REPO_DELETE, id);
    }

    deleteMany<I, Q>(service: ServiceInstance, query: Q): OP<I[]> {
        return Services.invoke<DeleteMany<I, Q>>(service, FIELD_NAME.REPO_DELETE_MANY, query);
    }

    update<I, D>(service: ServiceInstance, id: I, data: Partial<D>): OP<void> {
        return Services.invoke<Update<I, D>>(service, FIELD_NAME.REPO_UPDATE, id, data);
    }

    updateMany<I, Q, D>(service: ServiceInstance, query: Q, data: Partial<D>): OP<I[]> {
        return Services.invoke<UpdateMany<I, Q, D>>(service, FIELD_NAME.REPO_UPDATE_MANY, query, data);
    }
}
