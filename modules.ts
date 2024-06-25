import type { ServiceCtr, ServiceCtrMap } from "./service-registery";

export const MODULE_DEPS_FIELD = "d";

export type ModuleInit<D extends ServiceCtrMap = {}> = {
    name?: string;
    sideEffects?: ServiceCtr[];
    deps?: D;
};

export interface ModuleInterface<U extends ServiceCtrMap> {
    [MODULE_DEPS_FIELD]: U;
}
