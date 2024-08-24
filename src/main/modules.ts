import type { ComponentCtr } from "./registery";

export type ModuleInit = {
    name: string;
    sideEffects?: ComponentCtr[];
    roles?: string[];
};
