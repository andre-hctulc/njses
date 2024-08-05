import { Configure, Destroy, Init, Mount } from "./decorators";
import { NJSESError } from "./errors";
import { Shadow } from "./shadow";
import { FIELD_NAME } from "./utils/system";
import hash from "stable-hash";

/*
stable-hash creates a hash from an object that is stable across different runs of the program.
Order of keys in objects does not affect the hash.
*/

export interface DefaultServiceInit {
    name: string;
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
    // static
    | S
    // static with params
    | [S, ...ServiceParams<S>]
    // computed (This must be an arrow function, so we can detect it
    // - arrow functions have no prototype, normal function do have one
    | ((dependant: D) => [S, ...ServiceParams<S>]);

export type ServiceCollection<
    M extends ServiceCollectionInterface = ServiceCollectionInterface,
    D extends ServiceInstance | null = null
> = {
    [K in keyof M]: SingleInjectable<M[K], D>;
};

/** Computables must be provided as an arrow function! */
export type Injectable<S extends ServiceCtr = ServiceCtr, D extends ServiceInstance = ServiceInstance> =
    | ServiceCollection<ServiceCollectionInterface, D>
    | SingleInjectable<S, D>;

type SingleInjection<I extends SingleInjectable> = I extends ServiceCtr
    ? ServiceInstance<I>
    : I extends [infer S, ...any[]]
    ? S extends ServiceCtr
        ? ServiceInstance<S>
        : never
    : I extends (dependant: any) => [infer S, ...any[]]
    ? S extends ServiceCtr
        ? ServiceInstance<S>
        : never
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
    return await Services.injectX(injectable, null);
}

/** `<serviceCtr, <paramsHash, T>>` */
type ServiceMapCache<T> = Map<string, Map<string, T>>;

class ServiceMap<T> {
    private map: ServiceMapCache<T> = new Map();

    allOf(serviceName: string) {
        return this.map.get(serviceName);
    }

    getAll() {
        return Array.from(this.map.entries());
    }

    get(serviceName: string, paramsHash: string) {
        return this.map.get(serviceName)?.get(paramsHash);
    }

    set(serviceName: string, paramsHash: string, value: T) {
        if (!this.map.has(serviceName)) this.map.set(serviceName, new Map([[paramsHash, value]]));
        else this.map.get(serviceName)!.set(paramsHash, value);
    }

    has(serviceName: string, paramsHash: string) {
        return this.map.get(serviceName)?.has(paramsHash) || false;
    }

    delete(serviceName: string, paramsHash: string) {
        this.map.get(serviceName)?.delete(paramsHash);
    }
}

export class ServiceRegistery {
    private instances = new ServiceMap<ServiceInstance>();
    private mounts = new ServiceMap<Promise<ServiceInstance>>();
    private roles: Map<string, Set<ServiceCtr>> = new Map();

    /**
     * Gets a static service instance
     */
    getInstance<S extends ServiceCtr>(service: S, params: ServiceParams<S>): ServiceInstance<S> | null {
        return this.instances.get(Shadow.getInit(service).name, hash(params)) || null;
    }

    getInstances<S extends ServiceCtr>(service: S): ServiceInstance<S>[] {
        return Array.from(this.instances.allOf(Shadow.getInit(service).name)?.values() || []);
    }

    private constructService<S extends ServiceCtr>(service: S, params: ServiceParams<S>): ServiceInstance<S> {
        return new service(...params) as any;
    }

    getAssignees(role: string): ServiceInstance[] {
        const services = Array.from(this.roles.get(role) || []);
        return services.map((service) => this.getInstances(service)).flat();
    }

    async destroy<S extends ServiceCtr>(service: S, reason: unknown, ...params: ServiceParams<S>) {
        const serviceName = Shadow.getInit(service).name;
        const paramsHash = hash(params);
        const instance = this.instances.get(serviceName, paramsHash);
        this.instances.delete(serviceName, paramsHash);
        this.mounts.delete(serviceName, paramsHash);
        if (instance) {
            await this.invokeAll<Destroy>(instance, Shadow.getMethods(service, FIELD_NAME.DESTROY), [reason]);
        }
    }

    private async mountService<S extends ServiceCtr>(
        service: S,
        params: ServiceParams<S>,
        forceDynamic = false
    ): Promise<ServiceInstance<S>> {
        const paramsHash = hash(params);
        const shadow = Shadow.get(service);

        if (!shadow)
            throw new NJSESError("Not a service. Use @Service or @Module decorator.", undefined, ["mount"]);

        // static
        if (!shadow.init.dynamic && !forceDynamic) {
            let instance = this.getInstance(service, params);

            // already mounted (or mounting) and ctr match
            // For ctr mismatches we need to re-mount, because the service might have changed. This is the case for hot-reloading.
            if (instance && instance.constructor === service) {
                return instance;
            }
            // first injection or mounting
            else {
                // if ctr mismatch, remove the old instance
                if (instance) {
                    // Check if ctr names are equal. If not it is guaranteed, that multiple services have the same name
                    if (instance.constructor.name !== service.name) {
                        throw new NJSESError(
                            `Multiple services with name '${instance.constructor.name}' registered.`,
                            undefined,
                            ["mount"]
                        );
                    }

                    await this.destroy(service, "re-mount", ...params);
                }

                if (this.mounts.has(shadow.init.name, paramsHash))
                    return this.mounts.get(shadow.init.name, paramsHash)!;

                // Set roles
                for (const role of shadow.roles) {
                    if (!this.roles.has(role)) this.roles.set(role, new Set());
                    this.roles.get(role)!.add(service);
                }

                instance = this.constructService(service, params);
                const mount = this._initService(instance);
                this.mounts.set(shadow.name, paramsHash, mount);
                mount
                    .then((inst) => this.instances.set(shadow.name, paramsHash, inst))
                    .finally(() => this.mounts.delete(shadow.name, paramsHash));
                return mount;
            }
        }
        // dynamic
        else {
            // Create always a new instance for dynamic services
            const instance = this.constructService(service, params);
            return await this._initService(instance);
        }
    }

    /**
     * Creates a **dynamic** service instance and returns it.
     */
    create<S extends ServiceCtr>(service: S, ...params: ServiceParams<S>): Promise<ServiceInstance<S>> {
        return this.mountService(service, params, true);
    }

    /**
     * Injects a service and returns it. Use `injectX` for further injection configuration.
     */
    inject<S extends ServiceCtr>(service: S, ...params: ServiceParams<S>): Promise<ServiceInstance<S>> {
        return this.mountService(service, params, false);
    }

    async injectX<I extends Injectable<ServiceCtr, D>, D extends ServiceInstance>(
        injectable: I,
        dependant: D | null = null
    ): Promise<Injection<I>> {
        if (Array.isArray(injectable)) {
            // static with params
            return this.mountService<any>(injectable[0], injectable.slice(1));
        } else if (typeof injectable === "function") {
            // IMP If injectable is computable and no arrow function, it will be treated as a static service here!
            if (injectable.prototype) {
                // static (Constructor function)
                return this.mountService(injectable as ServiceCtr<any>, []);
            } else {
                // computed (Compute function)
                return this.mountService(
                    (injectable as any).dep,
                    await (injectable as any).params(dependant)
                );
            }
        } else {
            // collection
            const obj: any = {};

            for (const key in injectable) {
                const collection: ServiceCollection<any, any> = injectable as ServiceCollection;
                const collectionItem = collection[key];
                obj[key] = await this.injectX(collectionItem, dependant);
            }
            Object.freeze(obj);
            return obj;
        }
    }

    resolve<T = any>(serviceInstance: ServiceInstance, field: string | symbol, ...params: any[]): T {
        if (typeof serviceInstance[field] === "function") return serviceInstance[field](...params);
        else return serviceInstance[field] as any;
    }

    invoke<M extends (...args: any) => any>(
        serviceInstance: ServiceInstance,
        methodName: string,
        ...params: Parameters<M>
    ): ReturnType<M> {
        if (typeof serviceInstance[methodName] !== "function")
            throw new NJSESError(
                `Method '${methodName}' not found on service instance of '${
                    Shadow.getInit(serviceInstance).name
                }'.`
            );
        return this.resolve(serviceInstance, methodName, params as any) as any;
    }

    invokeAll<M extends (...args: any) => any>(
        serviceInstance: ServiceInstance,
        methodNames: string[],
        ...params: Parameters<M>
    ): ReturnType<M>[] {
        return methodNames.map((methodName) => this.invoke(serviceInstance, methodName, ...params));
    }

    private async _initService(instance: ServiceInstance) {
        try {
            // 1. initialize side effects
            for (const sideEffect of Shadow.getSideEffects(instance)) {
                await this.mountService(sideEffect, []);
            }

            // 2. inject deps
            for (const depField in Shadow.getDeps(instance)) {
                const usable = Shadow.getDep(instance, depField)!;
                // mount deps
                Object.defineProperty(instance, depField, {
                    value: await this.injectX(usable, instance),
                    writable: false,
                    enumerable: true,
                });
            }

            // 3. call configures
            await this.invokeAll<Configure>(instance, Shadow.getMethods(instance, FIELD_NAME.CONFIGURE));

            // 4. call initializers
            await this.invokeAll<Init>(instance, Shadow.getMethods(instance, FIELD_NAME.INIT));

            // 5. call mounts
            await this.invokeAll<Mount>(instance, Shadow.getMethods(instance, FIELD_NAME.MOUNT));

            return instance;
        } catch (e) {
            throw new NJSESError("Failed to init service", e, ["init"]);
        }
    }

    print() {
        return `ServiceRegistery - Instances(${this.instances
            .getAll()
            .map(([serviceName, instances]) => `${serviceName}: ${instances.size}`)
            .join(", ")}) Mounts(${this.instances
            .getAll()
            .map(([serviceName, instances]) => `${serviceName}: ${instances.size}`)
            .join(", ")}) Roles(${Array.from(this.roles.entries())
            .map(([role, services]) => `${role}: ${services.size}`)
            .join(", ")})`;
    }
}

const glob: any = typeof window !== "undefined" ? window : global;

export const Services: ServiceRegistery =
    glob.__service_registery || (glob.__service_registery = new ServiceRegistery());
