import { Shadow } from "./shadow";
import { FIELD_NAME } from "./utils/system";
import hash from "stable-hash";

/*
stable-hash creates a hash from an object that is stable across different runs of the program.
Order of keys in objects does not affect the hash.
*/

export interface DefaultServiceInit {
    name?: string;
    dynamic?: boolean;
    namespace?: string;
}

export type ServiceCtr<S extends object = object> = new (...args: any) => object & S;

export type ServiceParams<S extends ServiceCtr> = ConstructorParameters<S>;

export type ServiceInstance<S extends object = any> = S extends new (...args: any) => infer I
    ? I extends object
        ? I
        : {}
    : any;

export type ServicePrototype = any;

export type ServiceCollectionInterface = Record<string, ServiceCtr>;

type SingleInjectable<S extends ServiceCtr = ServiceCtr, D extends ServiceInstance | null = null> =
    | S
    | [S, ...ServiceParams<S>]
    | { dep: S; params: (dependant: D) => ServiceParams<S> };

export type ServiceCollection<
    M extends ServiceCollectionInterface = ServiceCollectionInterface,
    D extends ServiceInstance | null = null
> = {
    [K in keyof M]: SingleInjectable<M[K], D>;
};

export type Injectable<S extends ServiceCtr = ServiceCtr, D extends ServiceInstance = ServiceInstance> =
    | ServiceCollection<ServiceCollectionInterface, D>
    | SingleInjectable<S, D>;

type SingleInjection<I extends SingleInjectable> = I extends ServiceCtr
    ? ServiceInstance<I>
    : I extends [infer S, ...any[]]
    ? S
    : I extends { dep: infer D; params: (dependant: any) => any }
    ? D
    : never;

export type Injection<I extends Injectable> = I extends SingleInjectable
    ? SingleInjection<I>
    : { [K in keyof I]: I[K] extends SingleInjectable ? SingleInjection<I[K]> : never };

export type Field<S extends ServiceInstance> = MethodName<S> | PropName<S>;

export type ResolvedField<S extends ServiceInstance, F extends Field<S>> = F extends MethodName<S>
    ? MethodReturnType<S, F>
    : S[F];

export type PropName<S extends ServiceInstance> = {
    [K in keyof S]: S[K] extends (...args: any) => any ? never : K;
}[keyof S];

export type PropValue<S extends ServiceInstance, P extends PropName<S>> = S[P];

export type MethodName<S extends ServiceInstance> = string &
    {
        [K in keyof S]: S[K] extends (...args: any[]) => any ? K : never;
    }[keyof S];

export type Method<S extends ServiceInstance, M extends MethodName<S>> = S[M] extends (...args: any) => any
    ? S[M]
    : never;

export type MethodReturnType<S extends ServiceInstance, M extends MethodName<S>> = ReturnType<Method<S, M>>;

export type MethodParams<S extends ServiceInstance, M extends MethodName<S>> = Parameters<Method<S, M>>;

/** Mounts the given service(s) */
export async function inject<I extends Injectable>(injectable: I): Promise<Injection<I>> {
    return await ServiceRegistery.inject(injectable, null);
}

/** `<serviceCtr, <paramsHash, T>>` */
type ServiceMapCache<T> = Map<ServiceCtr, Map<string, T>>;

class ServiceMap<T> {
    private map: ServiceMapCache<T> = new Map();

    getAll(service: ServiceCtr) {
        return this.map.get(service);
    }

    get(service: ServiceCtr, paramsHash: string) {
        return this.map.get(service)?.get(paramsHash);
    }

    set(service: ServiceCtr, paramsHash: string, value: T) {
        if (!this.map.has(service)) this.map.set(service, new Map([[paramsHash, value]]));
        else this.map.get(service)!.set(paramsHash, value);
    }

    has(service: ServiceCtr, paramsHash: string) {
        return this.map.get(service)?.has(paramsHash) || false;
    }

    delete(service: ServiceCtr, paramsHash: string) {
        this.map.get(service)?.delete(paramsHash);
    }
}

export abstract class ServiceRegistery {
    private static instances = new ServiceMap<ServiceInstance>();
    private static mounts = new ServiceMap<Promise<ServiceInstance>>();
    private static roles: Map<string, Set<ServiceCtr>> = new Map();

    /**
     * Gets a static service instance
     */
    static getInstance<S extends ServiceCtr>(
        service: S,
        params: ServiceParams<S>
    ): ServiceInstance<S> | null {
        return this.instances.get(service, hash(params)) || null;
    }

    static getInstances<S extends ServiceCtr>(service: S): ServiceInstance<S>[] {
        return Array.from(this.instances.getAll(service)?.values() || []);
    }

    private static constructService<S extends ServiceCtr>(
        service: S,
        params: ServiceParams<S>
    ): ServiceInstance<S> {
        return new service(...params) as any;
    }

    static getAssignees(role: string): ServiceInstance[] {
        const services = Array.from(this.roles.get(role) || []);
        return services.map((service) => this.getInstances(service)).flat();
    }

    /**
     * Mounts the service and returns the instance.
     */
    static mount<S extends ServiceCtr>(service: S, ...params: ServiceParams<S>): Promise<ServiceInstance<S>> {
        return this.mountService(service, params, true);
    }

    /**
     * Creates a new service instance and returns it.
     */
    static create<S extends ServiceCtr>(
        service: S,
        ...params: ServiceParams<S>
    ): Promise<ServiceInstance<S>> {
        return this.mountService(service, params, true);
    }

    static async destroy<S extends ServiceCtr>(service: S, cause: any, ...params: ServiceParams<S>) {
        const paramsHash = hash(params);
        const instance = this.instances.get(service, paramsHash);
        if (instance) {
            await this.invokeAll(instance, Shadow.getMethods(service, FIELD_NAME.DESTROY), [cause]);
        }
        this.instances.delete(service, paramsHash);
        this.mounts.delete(service, paramsHash);
    }

    private static async mountService<S extends ServiceCtr>(
        service: S,
        params: ServiceParams<S>,
        forceDynamic = false
    ): Promise<ServiceInstance<S>> {
        const paramsHash = hash(params);
        const shadow = Shadow.get(service);

        if (!shadow) throw new Error("Not a service. Use @Service or @Module decorator.");

        // static
        if (!shadow.init.dynamic && !forceDynamic) {
            let instance = this.getInstance(service, params);

            // first injection
            if (!instance) {
                instance = this.constructService(service, params);
                this.instances.set(service, paramsHash, instance);
                const mount = this._initService(instance);
                this.mounts.set(service, paramsHash, mount);
                return mount;
            }
            // already mounted (or mounting)
            else {
                // TODO do this with events?
                const mounting = await this.mounts.get(service, paramsHash);
                // This should never happen
                if (!mounting) throw new Error("Mount not found");
                return mounting;
            }
        }
        // dynamic
        else {
            // Create always a new instance for dynamic services
            const instance = this.constructService(service, params);
            return await this._initService(instance);
        }
    }

    static async inject<S extends ServiceCtr, I extends Injectable<S, D>, D extends ServiceInstance>(
        injectable: I,
        dependant: D | null = null
    ): Promise<Injection<I>> {
        if (Array.isArray(injectable)) {
            // single params
            return this.mountService<any>(injectable[0], injectable.slice(1));
        } else if (typeof injectable === "function") {
            // single static
            return this.mountService(injectable as ServiceCtr<any>, []);
        } else {
            // single computed params
            if (typeof (injectable as any)["params"] === "function") {
                return await this.mountService(
                    (injectable as any).dep,
                    await (injectable as any).params(dependant)
                );
            }

            // collection

            const obj: any = {};

            for (const key in injectable) {
                const collection: ServiceCollection<any, any> = injectable as ServiceCollection;
                const collectionItem = collection[key];
                obj[key] = await this.inject(collectionItem, dependant);
            }
            Object.freeze(obj);
            return obj;
        }
    }

    static resolve<T = any>(serviceInstance: ServiceInstance, field: string | symbol, ...params: any[]): T {
        if (typeof serviceInstance[field] === "function") return serviceInstance[field](...params);
        else return serviceInstance[field] as any;
    }

    static invoke<M extends (...args: any) => any>(
        serviceInstance: ServiceInstance,
        methodName: string,
        params: Parameters<M>
    ): ReturnType<M> {
        return this.resolve(serviceInstance, methodName, ...(params as any)) as any;
    }

    static invokeAll<M extends (...args: any) => any>(
        serviceInstance: ServiceInstance,
        methodNames: string[],
        params: Parameters<M>
    ): ReturnType<M>[] {
        return methodNames.map((methodName) => this.invoke(serviceInstance, methodName, params));
    }

    private static async _initService(instance: ServiceInstance) {
        // 1. initialize side effects
        for (const sideEffect of Shadow.getSideEffects(instance)) {
            await this.mountService(sideEffect, []);
        }

        // 2. inject deps
        for (const depField in Shadow.getDeps(instance)) {
            const usable = Shadow.getDep(instance, depField)!;
            // mount deps
            Object.defineProperty(instance, depField, {
                value: await this.inject(usable, instance),
                writable: false,
                enumerable: true,
            });
        }

        // 3. call initializers
        await this.invokeAll(instance, Shadow.getMethods(instance, FIELD_NAME.INIT), []);

        // 4. call mounts
        await this.invokeAll(instance, Shadow.getMethods(instance, FIELD_NAME.MOUNT), []);

        return instance;
    }
}
