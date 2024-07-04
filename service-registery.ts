import { ServiceShadow, Shadow } from "./shadow";
import { FIELD_NAME } from "./system";
import { DefaultModule } from "./services/default-module";
import hash from "stable-hash";

export interface DefaultServiceInit {
    eager?: boolean;
    name?: string;
    dynamic?: boolean;
    namespace?: string;
}

export type ServiceCtr<S = any> = new (...args: any) => S;
export type StaticServiceCtr<S = any> = new () => S;
export type ServiceParams<S extends Usable> = S extends ServiceCtr ? ConstructorParameters<S> : never;
export type ServiceInstance<S = any> = S extends new (...args: any) => infer I ? I : any;
export type ServicePrototype = any;
export type ServiceCollectionInterface = Record<string, any>;
export type ServiceCollection<M extends ServiceCollectionInterface = ServiceCollectionInterface> = {
    [K in keyof M]: StaticServiceCtr<M[K]>;
};
export type Usable = ServiceCtr | ServiceCollection<any>;
export type Injection<U extends Usable> = U extends ServiceCollection
    ? {
          [K in keyof U]: ServiceInstance<U[K]>;
      }
    : ServiceInstance<U>;

/** Mounts the given service(s) */
export async function use<U extends Usable>(
    usable: U,
    ...params: ServiceParams<U> extends never ? [] : ServiceParams<U>
): Promise<Injection<U>> {
    return await ServiceRegistery.inject(usable, params as ServiceParams<U>);
}

/** Returns mounted service(s) */
export function useSync<U extends Usable>(
    usable: U,
    ...params: ServiceParams<U> extends never ? [] : ServiceParams<U>
): Injection<U> {
    let instance: ServiceInstance;
    let shadow: ServiceShadow;

    const err = (name: string) => {
        throw new Error(`Service "${name}" not mounted`);
    };

    if (typeof usable === "function") {
        shadow = Shadow.get(usable, true);
        instance = ServiceRegistery.getInstance(usable, params);
        if (!instance) err(shadow.name);
        return instance;
    } else {
        const result: any = {};
        for (const key in usable) {
            instance = ServiceRegistery.getInstance(usable[key] as any, []);
            shadow = Shadow.get(instance, true);
            if (!instance) err(shadow.name);
            result[key] = instance;
        }
        return result;
    }
}

/** `<serviceCtr, <paramsHash, T>>` */
export type ServiceMap<T> = Map<ServiceCtr, Map<string, T>>;

export abstract class ServiceRegistery {
    /** `<serviceId, <paramsHash, serviceCtr>>` */
    private static instances: ServiceMap<ServiceInstance> = new Map();
    private static mounts: ServiceMap<Promise<ServiceInstance>> = new Map();
    private static roles: Map<string, Set<ServiceCtr>> = new Map();

    // static get(serviceId: string, params: [...any]): ServiceCtr | null {
    //     return this.instances.get(serviceId)?.get(hash(params)) || null;
    // }

    // static getInstanceById(serviceId: string, params: [...any]): ServiceInstance | null {
    //     return this.instances.get(serviceId)?.get(hash(params)) || null;
    // }

    static getInstance<S extends ServiceCtr>(
        service: S,
        params: ServiceParams<S>
    ): ServiceInstance<S> | null {
        return this.instances.get(service)?.get(hash(params)) || null;
    }

    static getInstances<S extends ServiceCtr>(service: S): ServiceInstance<S>[] {
        return Array.from(this.instances.get(service)?.values() || []);
    }

    private static constructService<S extends ServiceCtr>(
        service: S,
        paranms: ServiceParams<S>
    ): ServiceInstance<S> {
        return new service(...paranms);
    }

    static getAssignees(role: string): ServiceInstance[] {
        const services = Array.from(this.roles.get(role) || []);
        return services.map((service) => this.getInstances(service)).flat();
    }

    private static async mountDefaultModule() {
        /** initilizes default services */
        return await this.mountService(DefaultModule, []);
    }

    static async mountService<S extends ServiceCtr>(
        service: S,
        params: ServiceParams<S>
    ): Promise<ServiceInstance<S>> {
        const paramsHash = hash(params);
        const shadow = Shadow.get(service);
        let instance: ServiceInstance;

        if (!shadow?.init.dynamic) {
            instance = this.getInstance(service, params);

            if (!instance) {
                instance = this.constructService(service, params);
                this.instances.set(service, instance);
            }
            // return static instance if available
            if (this.mounts.get(service)?.has(paramsHash)) {
                const mounting = await this.mounts.get(service)!.get(paramsHash)!;
                return mounting;
            }
        }
        // dynamic
        else {
            // Create always a new instance for dynamic services
            instance = this.constructService(service, params);
        }

        const mount = this._initService(instance);

        // if static mount, save the promise
        if (!shadow?.init.dynamic) {
            if (!this.mounts.has(service)) this.mounts.set(service, new Map());
            this.mounts.get(service)!.set(paramsHash, mount);
        }

        return mount;
    }

    static async inject<U extends Usable>(usable: U, params: ServiceParams<U>): Promise<Injection<U>> {
        if (typeof usable === "function") return await this.mountService(usable, params);
        else {
            const obj: any = {};
            for (const key in usable) {
                obj[key] = await this.inject(usable[key] as any, []);
            }
            Object.freeze(obj);
            return obj;
        }
    }

    static resolve<R = any>(
        serviceInstance: ServiceInstance<any>,
        field: string | symbol,
        params: any[] = []
    ): R {
        const val = (serviceInstance as any)?.[field];
        if (typeof val === "function") {
            return val(...params);
        } else return val;
    }

    static invoke<F extends (...args: any) => any>(
        serviceInstance: ServiceInstance<any>,
        field: string,
        params: Parameters<F>
    ): ReturnType<F> {
        return this.resolve(serviceInstance, field, params);
    }

    /**
     * Creates a dynamic service instance
     */
    static async create<S extends ServiceCtr>(
        service: S,
        ...params: ServiceParams<S> extends never ? [] : ServiceParams<S>
    ): Promise<ServiceInstance<S>> {
        if (!Shadow.isDynamic(service)) throw new Error("Service is not dynamic");
        const instance = await this.mountService(service, params as any);
        return instance;
    }

    private static async _initService(instance: ServiceInstance) {
        // mount default module first
        const defaultModule = await this.mountDefaultModule();

        // 0. Call configurers
        for (const conf of Shadow.getMethods(instance, FIELD_NAME.CONFIGURE)) {
            // We pass the default module as arg, because injections are not available yet.
            // So we provide the default module for configuration purposes.
            await this.invoke(instance, conf, [defaultModule]);
        }

        // 1. initialize side effects
        for (const sideEffect of Shadow.getSideEffects(instance)) {
            await this.mountService(sideEffect, []);
        }

        // 2. apply factories
        for (const factory of Shadow.getFactories(instance)) {
            for (const factoryMethod of Shadow.getMethods(factory, FIELD_NAME.FACTORY)) {
                const mountedFactory = await this.mountService(factory, []);

                let params: any[] = [];
                const paramField = Shadow.getProductParam(factory, instance);

                if (paramField) {
                    params = await this.resolve(instance, paramField);
                    if (!Array.isArray(params)) params = [params];
                }

                await this.invoke(mountedFactory, factoryMethod, [instance, ...params]);
            }
        }

        // 3. inject deps
        for (const depField in Shadow.getDeps(instance)) {
            const usable = Shadow.getDep(instance, depField)!;
            // mount deps
            Object.defineProperty(instance, depField, {
                value: await this.inject(usable.usable, usable.params),
                writable: false,
                enumerable: true,
            });
        }

        // 4. call initializers
        for (const iniMethod of Shadow.getMethods(instance, FIELD_NAME.INIT)) {
            await this.invoke(instance, iniMethod, []);
        }

        // 5. call mounts
        for (const mountMethod of Shadow.getMethods(instance, FIELD_NAME.MOUNT)) {
            // do not await!
            this.invoke(instance, mountMethod, []);
        }

        return instance;
    }
}
