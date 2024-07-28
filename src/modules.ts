import type {  ServiceCtr } from "./service-registery";


export type ModuleInit = {
    name: string;
    sideEffects?: ServiceCtr[];
    roles?: string[];
};