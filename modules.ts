import type { ServiceCollection, ServiceCollectionInterface, StaticServiceCtr } from "./service-registery";

export const MODULE_DEPS_FIELD = "d";

export type ModuleInit<D extends ServiceCollectionInterface> = {
    name?: string;
    sideEffects?: StaticServiceCtr[];
    roles?: string[];
} & (keyof D extends never ? { deps?: ServiceCollection } : { deps: ServiceCollection<D> });

export interface ModuleInterface<U extends ServiceCollectionInterface> {
    [MODULE_DEPS_FIELD]: U;
}
