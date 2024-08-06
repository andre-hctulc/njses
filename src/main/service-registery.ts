import { Configure, Destroy, Init, Mount } from "./decorators";
import { NJSESError } from "./errors";
import { Shadow } from "./shadow";
import { FIELD_NAME } from "./system";
import hash from "stable-hash";

/*
stable-hash creates a hash from an object that is stable across different runs of the program.
Order of keys in objects does not affect the hash.
*/

export interface DefaultShadowInit {
    name: string;
    dynamic?: boolean;
    namespace?: string;
}

export type ServiceCtr<S extends object = object> = new (...args: any) => object & S;
export type EntityCtr<E extends object = object> = new (...args: any) => object & E;

export type ParamsOf<S extends ServiceCtr> = ConstructorParameters<S>;

export type Instance<S extends object = any> = S extends new (...args: any) => infer I
    ? I extends object
        ? I
        : {}
    : any;

export type ServicePrototype = any;

export type ServiceCollectionInterface = Record<string, ServiceCtr>;

type SingleInjectable<S extends ServiceCtr = ServiceCtr, D extends Instance | null = null> =
    // static
    | S
    // static with params
    | [S, ...ParamsOf<S>]
    // computed (This must be an arrow function, so we can detect it
    // - arrow functions have no prototype, normal function do have one
    | ((dependant: D) => [S, ...ParamsOf<S>]);

export type ServiceCollection<
    M extends ServiceCollectionInterface = ServiceCollectionInterface,
    D extends Instance | null = null
> = {
    [K in keyof M]: SingleInjectable<M[K], D>;
};

/** Computables must be provided as an arrow function! */
export type Injectable<S extends ServiceCtr = ServiceCtr, D extends Instance = Instance> =
    | ServiceCollection<ServiceCollectionInterface, D>
    | SingleInjectable<S, D>;

type SingleInjection<I extends SingleInjectable> = I extends ServiceCtr
    ? Instance<I>
    : I extends [infer S, ...any[]]
    ? S extends ServiceCtr
        ? Instance<S>
        : never
    : I extends (dependant: any) => [infer S, ...any[]]
    ? S extends ServiceCtr
        ? Instance<S>
        : never
    : never;

export type Injection<I extends Injectable> = I extends SingleInjectable
    ? SingleInjection<I>
    : { [K in keyof I]: I[K] extends SingleInjectable ? SingleInjection<I[K]> : never };

export type Field<S extends Instance> = MethodName<S> | PropName<S>;

export type ResolvedField<S extends Instance, F extends Field<S>> = F extends MethodName<S>
    ? MethodReturnType<S, F>
    : S[F];

export type PropName<S extends Instance> = {
    [K in keyof S]: S[K] extends (...args: any) => any ? never : K;
}[keyof S];

export type PropValue<S extends Instance, P extends PropName<S>> = S[P];

export type MethodName<S extends Instance> = string &
    {
        [K in keyof S]: S[K] extends (...args: any[]) => any ? K : never;
    }[keyof S];

export type Method<S extends Instance, M extends MethodName<S>> = S[M] extends (...args: any) => any
    ? S[M]
    : never;

export type MethodReturnType<S extends Instance, M extends MethodName<S>> = ReturnType<Method<S, M>>;

export type MethodParams<S extends Instance, M extends MethodName<S>> = Parameters<Method<S, M>>;

/** Mounts the given service(s) */
export async function inject<I extends Injectable>(injectable: I): Promise<Injection<I>> {
    return await App.injectX(injectable, null);
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

export class Container {
    private _construct<S extends ServiceCtr | EntityCtr>(Class: S, params: ParamsOf<S>): Instance<S> {
        return new Class(...params) as any;
    }

    private _serviceInstances = new ServiceMap<Instance>();
    private _serviceMmounts = new ServiceMap<Promise<Instance>>();
    private _serviceRoles: Map<string, Set<ServiceCtr>> = new Map();

    /**
     * Gets a static service instance
     */
    getServiceInstance<S extends ServiceCtr>(service: S, params: ParamsOf<S>): Instance<S> | null {
        return this._serviceInstances.get(Shadow.require(service).name, hash(params)) || null;
    }

    getServiceInstances<S extends ServiceCtr>(service: S): Instance<S>[] {
        return Array.from(this._serviceInstances.allOf(Shadow.require(service).name)?.values() || []);
    }

    getAssignees(role: string): Instance[] {
        const services = Array.from(this._serviceRoles.get(role) || []);
        return services.map((service) => this.getServiceInstances(service)).flat();
    }

    async destroyService<S extends ServiceCtr>(service: S, reason: unknown, ...params: ParamsOf<S>) {
        const shadow = Shadow.require(service);
        const serviceName = shadow.name;
        const paramsHash = hash(params);
        const instance = this._serviceInstances.get(serviceName, paramsHash);
        this._serviceInstances.delete(serviceName, paramsHash);
        this._serviceMmounts.delete(serviceName, paramsHash);
        if (instance) {
            await this.invokeAll<Destroy>(instance, shadow.getMethods(FIELD_NAME.DESTROY), [reason]);
        }
    }

    /**
     * Mounts a service or an entity.
     */
    private async mount<C extends ServiceCtr | EntityCtr>(
        source: C,
        params: ParamsOf<C>,
        forceDynamic = false
    ): Promise<Instance<C>> {
        const shadow = Shadow.require(source);

        // Service
        if (!shadow.init.dynamic && !forceDynamic) {
            const paramsHash = hash(params);
            let instance = this.getServiceInstance(source, params);

            // already mounted (or mounting) and ctr match
            // For ctr mismatches we need to re-mount, because the service might have changed. This is the case for hot-reloading.
            if (instance && instance.constructor === source) {
                return instance;
            }
            // first injection or mounting
            else {
                // if ctr mismatch, remove the old instance
                if (instance) {
                    // Check if ctr names are equal. If not it is guaranteed, that multiple services have the same name
                    if (instance.constructor.name !== source.name) {
                        throw new NJSESError(
                            `Multiple services with name '${instance.constructor.name}' registered.`,
                            undefined,
                            ["mount"]
                        );
                    }

                    await this.destroyService(source, "re-mount", ...params);
                }

                if (this._serviceMmounts.has(shadow.init.name, paramsHash))
                    return this._serviceMmounts.get(shadow.init.name, paramsHash)!;

                // Set roles
                for (const role of shadow.getRoles()) {
                    if (!this._serviceRoles.has(role)) this._serviceRoles.set(role, new Set());
                    this._serviceRoles.get(role)!.add(source);
                }

                instance = this._construct(source, params);
                const mount = this._init(instance);
                this._serviceMmounts.set(shadow.name, paramsHash, mount);
                mount
                    .then((inst) => this._serviceInstances.set(shadow.name, paramsHash, inst))
                    .finally(() => this._serviceMmounts.delete(shadow.name, paramsHash));
                return mount;
            }
        }
        // Entity
        else {
            // Create always a new instance for dynamic services
            const instance = this._construct(source, params);
            return await this._init(instance);
        }
    }

    /**
     * Creates an Entity.
     */
    createEntity<S extends EntityCtr>(entitiCtr: S, ...params: ParamsOf<S>): Promise<Instance<S>> {
        const shadow = Shadow.require(entitiCtr);
        if (!shadow.isEntity) throw new NJSESError("Not an entity.", undefined, ["createEntity"]);
        return this.mount(entitiCtr, params, true);
    }

    /**
     * Injects a service and returns it. Use `injectX` for further injection configuration.
     */
    inject<S extends ServiceCtr>(service: S, ...params: ParamsOf<S>): Promise<Instance<S>> {
        const shadow = Shadow.require(service);
        if (shadow.isEntity) throw new NJSESError("Entities cannot be injected.", undefined, ["inject"]);
        return this.mount(service, params, false);
    }

    async injectX<I extends Injectable<ServiceCtr, D>, D extends Instance>(
        injectable: I,
        dependant: D | null = null
    ): Promise<Injection<I>> {
        if (Array.isArray(injectable)) {
            // static with params
            return this.mount<any>(injectable[0], injectable.slice(1));
        } else if (typeof injectable === "function") {
            // IMP If injectable is computable and no arrow function, it will be treated as a static service here!
            if (injectable.prototype) {
                // static (Constructor function)
                return this.mount(injectable as ServiceCtr<any>, []);
            } else {
                // computed (Compute function)
                return this.mount((injectable as any).dep, await (injectable as any).params(dependant));
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

    resolve<T = any>(instance: Instance, field: string | symbol, ...params: any[]): T {
        if (typeof instance[field] === "function") return instance[field](...params);
        else return instance[field] as any;
    }

    /**
     * @param instance Service or Entity instance
     */
    invoke<M extends (...args: any) => any>(
        instance: Instance,
        methodName: string,
        ...params: Parameters<M>
    ): ReturnType<M> {
        if (typeof instance[methodName] !== "function") {
            throw new NJSESError(`Method '${methodName}' not defined`, undefined, ["invoke"]);
        }
        return this.resolve(instance, methodName, params as any) as any;
    }

    /**
     * @param instance Service or Entity instance
     */
    invokeAll<M extends (...args: any) => any>(
        instance: Instance,
        methodNames: string[],
        ...params: Parameters<M>
    ): ReturnType<M>[] {
        return methodNames.map((methodName) => this.invoke(instance, methodName, ...params));
    }

    private async _init(instance: Instance) {
        const shadow = Shadow.require(instance);
        let stage = "";

        try {
            // 1. initialize side effects
            stage = "side-effects";
            for (const sideEffect of shadow.getSideEffects()) {
                await this.mount(sideEffect, []);
            }

            // 2. inject deps
            stage = "injections";
            for (const depField in shadow.getInjections()) {
                const usable = shadow.getInjection(depField)!;
                // mount deps
                Object.defineProperty(instance, depField, {
                    value: await this.injectX(usable, instance),
                    writable: false,
                    enumerable: true,
                });
            }

            // 3. call configures
            stage = "configuration";
            await this.invokeAll<Configure>(instance, shadow.getMethods(FIELD_NAME.CONFIGURE));

            // 4. call initializers
            stage = "init-callbacks";
            await this.invokeAll<Init>(instance, shadow.getMethods(FIELD_NAME.INIT));

            // 5. call mounts
            stage = "mount-callbacks";
            await this.invokeAll<Mount>(instance, shadow.getMethods(FIELD_NAME.MOUNT));

            return instance;
        } catch (e) {
            throw new NJSESError("Initialization failed", e, ["_init", stage]);
        }
    }

    print() {
        return `Container - Services(${this._serviceInstances
            .getAll()
            .map(([serviceName, instances]) => `${serviceName}: ${instances.size}`)
            .join(", ")}) Mounts(${this._serviceInstances
            .getAll()
            .map(([serviceName, instances]) => `${serviceName}: ${instances.size}`)
            .join(", ")}) Roles(${Array.from(this._serviceRoles.entries())
            .map(([role, services]) => `${role}: ${services.size}`)
            .join(", ")})`;
    }
}

const glob: any = typeof window !== "undefined" ? window : global;

export const App: Container = glob.__service_registery || (glob.__service_registery = new Container());
