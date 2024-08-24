import { Registery, type Injectable, type Injection } from "./registery";

export class AppContainer {
    readonly registery = new Registery();

    constructor() {}
}

const glob: any = typeof window !== "undefined" ? window : global;

export const App: AppContainer = glob.__service_registery || (glob.__service_registery = new AppContainer());

/** Mounts the given service(s) */
export async function inject<I extends Injectable>(injectable: I): Promise<Injection<I>> {
    return await App.registery.injectX(injectable, null);
}
