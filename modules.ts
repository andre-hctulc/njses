import type { ServiceCollection, ServiceCollectionInterface, ServiceCtr } from "./service-registery";

export const MODULE_DEPS_FIELD = "d";

export type ModuleInit<D extends ServiceCollectionInterface> = {
    name?: string;
    sideEffects?: ServiceCtr[];
} & (keyof D extends never ? { deps?: ServiceCollection } : { deps: ServiceCollection<D> });

export interface ModuleInterface<U extends ServiceCollectionInterface> {
    [MODULE_DEPS_FIELD]: U;
}
