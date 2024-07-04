import { ServiceShadow, Shadow } from "./shadow";
import { FIELD_NAME } from "./system";
import { DefaultModule } from "./services/default-module";

export interface DefaultServiceInit {
    eager?: boolean;
    name?: string;
    namespace?: string;
}

export type ServiceCtr<S = any> = new () => S;
export type ServiceInstance<S = any> = S extends new () => infer I ? I : any;
export type ServicePrototype = any;
export type ServiceCollectionInterface = Record<string, any>;
export type ServiceCollection<M extends ServiceCollectionInterface = any> = {
    [K in keyof M]: ServiceCtr<M[K]>;
};
export type Usable = ServiceCtr<any> | ServiceCollection<any>;
export type Injection<U extends Usable> = U extends Record<string, ServiceCtr<any>>
    ? {
          [K in keyof U]: ServiceInstance<U[K]>;
      }
    : ServiceInstance<U>;

/** Mounts the given service(s) */
export async function use<U extends Usable>(usable: U): Promise<Injection<U>> {
    return await ServiceRegistery.inject(usable);
}

/** Returns mounted service(s) */
export function useSync<U extends Usable>(usable: U): Injection<U> {
    let instance: ServiceInstance;
    let shadow: ServiceShadow;

    const err = (name: string) => {
        throw new Error(`Service "${name}" not mounted`);
    };

    if (typeof usable === "function") {
        shadow = Shadow.get(usable, true);
        instance = ServiceRegistery.getInstanceByCtr(usable);
        if (!instance) err(shadow.name);
        return instance;
    } else {
        const result: any = {};
        for (const key in usable) {
            instance = ServiceRegistery.getInstanceByCtr(usable[key] as ServiceCtr);
            shadow = Shadow.get(instance, true);
            if (!instance) err(shadow.name);
            result[key] = instance;
        }
        return result;
    }
}

export abstract class ServiceRegistery {
    private static services: Map<string, ServiceCtr> = new Map();
    private static servicesReverse: Map<ServiceCtr, string> = new Map();
    private static serviceMounts: Map<string, Promise<ServiceInstance>> = new Map();
    private static serviceInstances: Map<string, ServiceInstance> = new Map();
    private static roles: Map<string, Set<string>> = new Map();

    /** Mounts the given service(s) */
    static async inject<U extends Usable>(usable: U): Promise<Injection<U>> {
        if (typeof usable === "function") {
            const instance = await this.mountService(usable);
            return instance as any;
        } else {
            const result: any = {};
            for (const key in usable) {
                const s = usable[key];
                const inst = await this.inject(s as any);
                result[key] = inst;
            }
            return result;
        }
    }

    static get(serviceId: string): ServiceCtr | null {
        return this.services.get(serviceId) || null;
    }

    static getInstance(serviceName: string): ServiceInstance | null {
        const service = this.get(serviceName);
        if (!service) return null;
        return this.inject(service) as ServiceInstance;
    }

    static getInstanceByCtr(service: ServiceCtr): ServiceInstance | null {
        return this.getInstance(this.servicesReverse.get(service) as string);
    }

    private static constructService<S>(service: ServiceCtr<S>): S {
        return new service();
    }

    static getAssignees(role: string): ServiceInstance[] {
        const ids = Array.from(this.roles.get(role) || []);
        return ids.map((id) => this.serviceInstances.get(id)!);
    }

    /**
     * Registers the given service
     * @param eager If true, the service is mounted immediately
     */
    static register(service: ServiceCtr, eager = false): string {
        if (this.servicesReverse.has(service)) return this.servicesReverse.get(service)!;
        const shadow = Shadow.get(service);
        if (!shadow) throw new Error("Service not registered");
        const id = shadow.id;
        // remember in maps
        this.services.set(id, service);
        this.servicesReverse.set(service, id);
        // construct and remember the service
        this.serviceInstances.set(id, this.constructService(service));
        // remember roles
        for (const role of shadow.roles) {
            if (!this.roles.has(role)) this.roles.set(role, new Set());
            this.roles.get(role)!.add(id);
        }
        // mount service if eager
        if (eager) this.mountService(service);
        return id;
    }

    private static async mountDefaultModule() {
        this.register(DefaultModule);
        /** initilizes default services */
        return await this.mountService(DefaultModule);
    }

    /**
     * @param dynamic If true, a new service instance is created, otherwise a registered service instance is used.
     */
    static async mountService(service: ServiceCtr, dynamic = false): Promise<any> {
        // mount default module first
        const defaultModule = await this.mountDefaultModule();

        let instance: any = this.getInstanceByCtr(service);
        let serviceId: string | undefined;

        if (!dynamic) {
            serviceId = this.servicesReverse.get(service);
            instance = this.getInstance(serviceId!);
            if (!serviceId || !instance) throw new Error("Service not registered");
            // return static instance if available
            if (this.serviceMounts.has(serviceId)) {
                const mounting = await this.serviceMounts.get(serviceId)!;
                return mounting;
            }
        } else {
            // Create always a new instance for non static mounts
            instance = this.constructService(service);
        }

        const mount = new Promise<any>(async (resolve, reject) => {
            const mountUsable = async (u: Usable) => {
                if (typeof u === "function") return await this.mountService(u);
                else {
                    const obj: any = {};
                    for (const key in u) {
                        obj[key] = await mountUsable(u[key]);
                    }
                    Object.freeze(obj);
                    return obj;
                }
            };

            try {
                // 0. Call configurers
                for (const conf of Shadow.getMethods(instance, FIELD_NAME.CONFIGURE)) {
                    // We pass the default module as arg, because injections are not available yet.
                    // So we provide the default module for configuration purposes.
                    await this.invoke(instance, conf, [defaultModule]);
                }

                // 1. initialize side effects
                for (const sideEffect of Shadow.getSideEffects(instance)) {
                    await this.mountService(sideEffect);
                }

                // 2. apply factories
                for (const factory of Shadow.getFactories(instance)) {
                    for (const factoryMethod of Shadow.getMethods(factory, FIELD_NAME.FACTORY)) {
                        const mountedFactory = await this.register(factory, true);

                        let params: any[] = [];
                        const paramField = Shadow.getProductParam(factory, instance);

                        if (paramField) {
                            params = await this.resolve(instance, paramField);
                            if (!Array.isArray(params)) params = [params];
                        }

                        await this.invoke(mountedFactory, factoryMethod, [service, ...params]);
                    }
                }

                // 3. inject deps
                for (const depField in Shadow.getDeps(instance)) {
                    const usable = Shadow.getDep(instance, depField)!;
                    // mount deps
                    Object.defineProperty(instance, depField, {
                        value: await mountUsable(usable),
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

                resolve(instance);
            } catch (err) {
                reject(err);
            }
        });

        // if static mount, save the promise
        if (!dynamic) this.serviceMounts.set(serviceId!, mount);

        return mount;
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
     * Creates a non static service instance
     */
    static async create<S>(service: ServiceCtr<S>): Promise<S> {
        const instance = await this.mountService(service, true);
        return instance;
    }
}
