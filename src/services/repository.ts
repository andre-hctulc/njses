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
} from "../main/decorators";
import { Instance, App } from "../main/service-registery";
import { Shadow } from "../main/shadow";
import { FIELD_NAME, ROLE_NAME } from "../main/system";
import type { OP } from "../utils/types";

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
 * Handles repositories.
 */
@Service({ name: "$$Repository" })
export class Repository {
    isRepo(service: Instance) {
        return Shadow.require(service).hasRole(ROLE_NAME.REPO);
    }

    private checkRepo(service: Instance) {
        if (!this.isRepo(service)) throw new Error("Service is not a repository.");
    }

    find<I, D>(service: Instance, id: I): OP<D | null> {
        this.checkRepo(service);
        return App.invoke<Find<I, D>>(service, FIELD_NAME.REPO_FIND, id);
    }

    findFirst<Q, D>(service: Instance, query: Q): OP<D | null> {
        this.checkRepo(service);
        return App.invoke<FindFirst<Q, D>>(service, FIELD_NAME.REPO_FIND_FIRST, query);
    }

    findMany<Q, D>(service: Instance, query: Q): OP<D[]> {
        this.checkRepo(service);
        return App.invoke<FindMany<Q, D>>(service, FIELD_NAME.REPO_FIND_MANY, query);
    }

    create<I, D>(service: Instance, data: Partial<D>): OP<I> {
        this.checkRepo(service);
        return App.invoke<Create<I, D>>(service, FIELD_NAME.REPO_CREATE, data);
    }

    createMany<I, D>(service: Instance, data: Partial<D>[]): OP<I[]> {
        this.checkRepo(service);
        return App.invoke<CreateMany<I, D>>(service, FIELD_NAME.REPO_CREATE_MANY, data);
    }

    delete<I>(service: Instance, id: I): OP<void> {
        this.checkRepo(service);
        return App.invoke<Delete<I>>(service, FIELD_NAME.REPO_DELETE, id);
    }

    deleteMany<I, Q>(service: Instance, query: Q): OP<I[]> {
        this.checkRepo(service);
        return App.invoke<DeleteMany<I, Q>>(service, FIELD_NAME.REPO_DELETE_MANY, query);
    }

    update<I, D>(service: Instance, id: I, data: Partial<D>): OP<void> {
        this.checkRepo(service);
        return App.invoke<Update<I, D>>(service, FIELD_NAME.REPO_UPDATE, id, data);
    }

    updateMany<I, Q, D>(service: Instance, query: Q, data: Partial<D>): OP<I[]> {
        this.checkRepo(service);
        return App.invoke<UpdateMany<I, Q, D>>(service, FIELD_NAME.REPO_UPDATE_MANY, query, data);
    }
}
