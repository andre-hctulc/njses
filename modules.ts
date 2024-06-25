import { ServiceCtr, ServiceCtrMap } from "./service-registery";

export type ModuleInit<U extends ServiceCtrMap = {}> = {
    name?: string;
    sideEffects?: ServiceCtr[];
    deps?: U;
};
