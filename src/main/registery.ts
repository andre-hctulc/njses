import { Configure, Destroy, Init, Mount } from "./decorators";
import { NJSESError } from "./errors";
import { Shadow } from "./shadow";
import { FIELD_NAME } from "./system";
import hash from "stable-hash";

/*
stable-hash creates a hash from an object that is stable across different runs of the program.
Order of keys in objects does not affect the hash.
*/

export type ComponentCtr<S extends object = object> = new (...args: any) => object & S;

export type ParamsOf<S extends ComponentCtr> = ConstructorParameters<S>;

export type Instance<S extends object = any> = S extends new (...args: any) => infer I
    ? I extends object
        ? I
        : {}
    : any;

export type ServicePrototype = any;

export type ServiceCollectionInterface = Record<string, ComponentCtr>;

type SingleInjectable<S extends ComponentCtr = ComponentCtr, D extends Instance | null = null> =
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
export type Injectable<S extends ComponentCtr = ComponentCtr, D extends Instance = Instance> =
    | ServiceCollection<ServiceCollectionInterface, D>
    | SingleInjectable<S, D>;

type SingleInjection<I extends SingleInjectable> = I extends ComponentCtr
    ? Instance<I>
    : I extends [infer S, ...any[]]
    ? S extends ComponentCtr
        ? Instance<S>
        : never
    : I extends (dependant: any) => [infer S, ...any[]]
    ? S extends ComponentCtr
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

/** `<serviceCtr, <paramsHash, T>>` */
type ServiceMapCache<T> = Map<string, Map<string, T>>;

class ComponentCache<T> {
    private map: ServiceMapCache<T> = new Map();

    allOf(componentName: string) {
        return this.map.get(componentName);
    }

    getAll() {
        return Array.from(this.map.entries());
    }

    get(componentName: string, paramsHash: string) {
        return this.map.get(componentName)?.get(paramsHash);
    }

    set(componentName: string, paramsHash: string, value: T) {
        if (!this.map.has(componentName)) this.map.set(componentName, new Map([[paramsHash, value]]));
        else this.map.get(componentName)!.set(paramsHash, value);
    }

    has(componentName: string, paramsHash: string) {
        return this.map.get(componentName)?.has(paramsHash) || false;
    }

    delete(componentName: string, paramsHash: string) {
        this.map.get(componentName)?.delete(paramsHash);
    }
}

export class Registery {
    /** Includes entities and services */
    private _registered: Map<string, ComponentCtr> = new Map();
    private _roles: Map<string, Set<ComponentCtr>> = new Map();
    private _serviceInstances = new ComponentCache<{ instance?: Instance; mount?: Promise<Instance> }>();

    private _construct<S extends ComponentCtr>(Class: S, params: ParamsOf<S>): Instance<S> {
        return new Class(...params) as any;
    }

    register(ctr: ComponentCtr) {
        const shadow = Shadow.require(ctr);
        this._registered.set(shadow.name, ctr);
        const roles = shadow.getRoles();
        // TODO are roles set here (order of decorators)
        roles.forEach((role) => {
            if (!this._roles.has(role)) this._roles.set(role, new Set());
            this._roles.get(role)!.add(ctr);
        });
    }

    getRegistered(componentName: string) {
        return this._registered.get(componentName) || null;
    }

    /**
     * Gets a static service instance
     */
    getServiceInstance<S extends ComponentCtr>(service: S, params: ParamsOf<S>): Instance<S> | null {
        return this._serviceInstances.get(Shadow.require(service).name, hash(params))?.instance || null;
    }

    getServiceInstances<S extends ComponentCtr>(service: S): Instance<S>[] {
        return Array.from(this._serviceInstances.allOf(Shadow.require(service).name)?.values() || [])
            .map((s) => s.instance)
            .filter((s) => s) as Instance<S>[];
    }

    getAssignees(role: string): ComponentCtr[] {
        return Array.from(this._roles.get(role) || []);
    }

    async destroyService<S extends ComponentCtr>(service: S, reason: unknown, ...params: ParamsOf<S>) {
        const shadow = Shadow.require(service);
        const serviceName = shadow.name;
        const paramsHash = hash(params);
        const registered = this._serviceInstances.get(serviceName, paramsHash);

        this._serviceInstances.delete(serviceName, paramsHash);

        if (registered?.instance) {
            await this.invokeAll<Destroy>(registered.instance, shadow.getMethods(FIELD_NAME.DESTROY), [
                reason,
            ]);
        }
    }

    /**
     * Mounts a service or an entity.
     */
    private async mount<C extends ComponentCtr>(
        source: C,
        params: ParamsOf<C>,
        forceDynamic = false
    ): Promise<Instance<C>> {
        const shadow = Shadow.require(source);

        // Service
        if (!shadow.init.dynamic && !forceDynamic) {
            const paramsHash = hash(params);
            const registered = this._serviceInstances.get(shadow.init.name, paramsHash);
            let instance = registered?.instance;

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

                if (registered?.mount) return registered.mount;

                // Set roles
                for (const role of shadow.getRoles()) {
                    if (!this._roles.has(role)) this._roles.set(role, new Set());
                    this._roles.get(role)!.add(source);
                }

                instance = this._construct(source, params);

                const mount = this._init(instance);

                this._serviceInstances.set(shadow.name, paramsHash, { mount, instance: undefined });

                mount.then((inst) =>
                    this._serviceInstances.set(shadow.name, paramsHash, {
                        instance: inst,
                        mount: undefined,
                    })
                );
                
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
     * Mounts an entity. Note that normally entites shoul not depend on njses lifecycle methods.
     */
    mountEntity<S extends ComponentCtr>(entitiCtr: S, ...params: ParamsOf<S>): Promise<Instance<S>> {
        const shadow = Shadow.require(entitiCtr);
        if (!shadow.isEntity) throw new NJSESError("Not an entity.", undefined, ["createEntity"]);
        return this.mount(entitiCtr, params, true);
    }

    /**
     * Injects a service and returns it. Use `injectX` for further injection configuration.
     */
    inject<S extends ComponentCtr>(service: S, ...params: ParamsOf<S>): Promise<Instance<S>> {
        const shadow = Shadow.require(service);
        if (shadow.isEntity) throw new NJSESError("Entities cannot be injected.", undefined, ["inject"]);
        return this.mount(service, params, false);
    }

    async injectX<I extends Injectable<ComponentCtr, D>, D extends Instance>(
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
                return this.mount(injectable as ComponentCtr<any>, []);
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
            .join(", ")}) Roles(${Array.from(this._roles.entries())
            .map(([role, services]) => `${role}: ${services.size}`)
            .join(", ")})`;
    }
}
