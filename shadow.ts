import type { DefaultServiceInit, ServiceCtr, ServiceInstance, Usable } from "./service-registery";
import { randomId } from "./system";

/** Property or Method */
type Field = string | symbol;

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomShadow {}

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomServiceInit {}

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomShadowProp {}

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomShadowParam {}

/** Method or Field */
export type FieldShadow = ServiceShadow["fields"][string];
export type ParamShadow = FieldShadow["params"][number];
export type ShadowInit = ServiceShadow["init"];

export interface ServiceShadow extends Partial<CustomShadow> {
    /** Service id */
    id: string;
    /** Service name */
    name: string;
    /** Service name */
    namespace: string;
    /** List of roles */
    roles: Set<string>;
    /** Service init */
    init: DefaultServiceInit & Partial<CustomServiceInit>;
    /** services (factories) */
    productOf: Set<ServiceCtr>;
    /** <factory, field/method>  */
    productParams: Map<ServiceCtr, Field>;
    /** prerequisites that do not need to be injected  */
    sideEffects: Set<ServiceCtr>;
    /** `<field, serviceId>` */
    deps: Record<Field, Usable>;
    /** Define some context */
    ctx: Record<string, any>;
    /** Stores data for each prop (field or method) and it's params */
    fields: Record<
        string | symbol,
        // default prop
        {
            field: string | symbol;
            params: Record<
                number,
                // default param
                {
                    mapArg?: (arg: any, param: ParamShadow) => any;
                } & Partial<CustomShadowParam>
            >;
            method: boolean;
        } & Partial<CustomShadowProp>
    >;
    /** <fieldType, fields> - Can be used to memorize special fields. e.g. options */
    props: Record<string, Set<Field>>;
    /** <methodType, methods> - Can be used to memorize special methods. e.g. initializers   */
    methods: Record<string, Set<string>>;
    /** Events */
    events: Record<string, Set<(...args: any) => void>>;
    /** Registerd event listeners */
    listeners: Record<string, Set<ServiceEventListener<any>>>;
}

export type ServiceEventListener<A extends [...any] = []> = (this: ServiceInstance<any>, ...args: A) => void;

const SHADOW_SYMBOL = Symbol("$hadow");

/** Default event types are prefixed with '$' */
export enum ServiceEvent {
    MOUNT = "$mount",
}

const proto = (service: any) => {
    // Class ctr
    if (typeof service === "function") return service.prototype;
    // Instance
    else if (service instanceof Object && service.prototype) return service.constructor.prototype;
    // Prototype
    else return service;
};

export abstract class Shadow {
    /**
     * Retrieves the shadow of the given service
     * @param service Can be a service class, instance or prototype
     * */
    static get<R extends boolean = false>(
        service: any,
        required?: R
    ): R extends true ? ServiceShadow : ServiceShadow | null {
        const sys = proto(service)?.[SHADOW_SYMBOL];
        if (required && !sys) throw new Error("Not a service");
        return sys || null;
    }

    /** Updates the shadow of the given service */
    static update(service: any, mutate: (sys: ServiceShadow) => ServiceShadow | void): ServiceShadow {
        let shadow: undefined | ServiceShadow = proto(service)[SHADOW_SYMBOL];
        // init shadow if not exists
        if (!shadow) {
            shadow = {
                name: "",
                namespace: "",
                id: randomId(),
                roles: new Set(),
                deps: {},
                productOf: new Set(),
                productParams: new Map(),
                events: {},
                init: {} as any,
                ctx: {},
                fields: {},
                listeners: {},
                sideEffects: new Set(),
                props: {},
                methods: {},
            };
        }
        shadow = mutate(shadow) || shadow;
        (service as any)[SHADOW_SYMBOL] = shadow;
        return shadow;
    }

    static addDep(service: any, field: Field, dep: Usable): void {
        this.update(service, (sys) => {
            sys.deps[field] = dep;
        });
    }

    static getDeps(service: any): Record<string, Usable> {
        const shadow = this.get(service, true);
        return shadow.deps;
    }

    static getDep(service: any, field: string): Usable | null {
        const shadow = this.get(service, true);
        return shadow.deps[field] || null;
    }

    static addSideEffect(service: any, ...effects: ServiceCtr[]): void {
        this.update(service, (sys) => {
            effects.forEach((c) => sys.sideEffects.add(c));
        });
    }

    static getSideEffects(service: any): ServiceCtr[] {
        const shadow = this.get(service, true);
        return Array.from(shadow.sideEffects);
    }

    static setCtx(service: any, key: string, value: any): void {
        this.update(service, (sys) => {
            sys.ctx[key] = value;
        });
    }

    static getCtx(service: any, key: string) {
        const shadow = this.get(service, true);
        return shadow.ctx[key];
    }

    static getField(service: any, propertyKey: Field): FieldShadow | null {
        const shadow = this.get(service, true);
        return shadow.fields[propertyKey];
    }

    static getFields(service: any): FieldShadow[] {
        const shadow = this.get(service, true);
        return Object.values(shadow.fields);
    }

    static hasField(service: any, propertyKey: Field): boolean {
        const shadow = this.get(service, true);
        return !!shadow.fields[propertyKey];
    }

    static getParam(service: any, propertyKey: Field, paramIndex: number): ParamShadow | null {
        const shadow = this.get(service, true);
        return shadow.fields[propertyKey]?.params[paramIndex] || null;
    }

    static getParams(service: any, propertyKey: Field): FieldShadow["params"] | null {
        const prop = this.getField(service, propertyKey);
        return prop?.params || null;
    }

    static addField(service: any, propertyKey: Field, data: Partial<FieldShadow>) {
        this.update(service, (sys) => {
            sys.fields[propertyKey] = {
                field: propertyKey as string,
                method: false,
                ...(sys.fields[propertyKey] as Partial<FieldShadow>),
                ...data,
                params: { ...sys.fields[propertyKey]?.params, ...data.params },
            };
        });
    }

    static addParam(service: any, propertyKey: Field, paramIndex: number, data: ParamShadow) {
        this.update(service, (sys) => {
            if (!sys.fields[propertyKey])
                sys.fields[propertyKey] = { field: propertyKey, params: {}, method: true };
            sys.fields[propertyKey].params[paramIndex] = {
                ...sys.fields[propertyKey]?.params[paramIndex],
                ...data,
            };
        });
    }

    static forEachArg(
        service: any,
        propertyKey: Field,
        args: any[],
        callback: (arg: any, param: ParamShadow | null, index: number) => void
    ) {
        this.mapArgs(service, propertyKey, args, callback);
    }

    /**
     * Map over given arguments and their shadow.
     */
    static mapArgs<I extends [...any], O extends [...any]>(
        service: any,
        propertyKey: Field,
        args: I,
        callback: (arg: any, param: ParamShadow | null, index: number) => O[number]
    ): O {
        const mapped: O = [] as any;
        const params = this.getParams(service, propertyKey) || {};
        const len = Math.max(args.length, Object.keys(params).length);

        for (let i = 0; i < len; i++) {
            const arg = args[i];
            const param = params[i] || null;
            mapped.push(callback(arg, param, i));
        }
        return mapped;
    }

    static addProp(service: any, type: string, field: Field) {
        this.update(service, (sys) => {
            if (!sys.props[type]) sys.props[type] = new Set();
            sys.props[type].add(field);
        });
    }

    static getProps(service: any, type: string): Field[] {
        const shadow = this.get(service, true);
        return Array.from(shadow.props[type] || []);
    }

    /**
     * @returns The _first_ property of the given type
     */
    static getProp<R extends boolean = false>(
        service: any,
        type: string,
        required?: R
    ): R extends true ? Field : Field | null {
        const shadow = this.get(service, true);
        const first = shadow.props[type].values().next().value;
        if (required && first == null) throw new Error(`No field of type "${type}"`);
        return first;
    }

    static addMethod(service: any, type: string, method: string) {
        this.update(service, (sys) => {
            if (!sys.methods[type]) sys.methods[type] = new Set();
            sys.methods[type].add(method);
        });
    }

    static getMethods(service: any, type: string): string[] {
        const shadow = this.get(service, true);
        return Array.from(shadow.methods[type] || []);
    }

    static getMethod<R extends boolean = false>(
        service: any,
        type: string,
        required?: R
    ): R extends true ? string : string | null {
        const shadow = this.get(service, true);
        const first = shadow.methods[type].values().next().value;
        if (required && first == null) throw new Error(`No method of type "${type}"`);
        return first;
    }

    static setProductParam(factory: ServiceCtr, target: ServiceCtr, field: Field) {
        this.update(factory, (sys) => {
            sys.productParams.set(target, field);
        });
    }

    static addFactory(factory: ServiceCtr, target: ServiceCtr) {
        this.update(target, (sys) => {
            sys.productOf.add(factory);
        });
    }

    static getFactories(target: ServiceCtr): ServiceCtr[] {
        const shadow = this.get(target, true);
        return Array.from(shadow.productOf);
    }

    static getProductParam(factory: ServiceCtr, target: any): Field | null {
        const shadow = this.get(target, true);
        return shadow.productParams.get(factory) || null;
    }

    static emit<A extends [...any] = []>(service: any, event: string, ...args: A) {
        const shadow = this.get(service, true);
        const listeners = shadow.listeners[event];
        if (!listeners) return;
        for (const listener of listeners) {
            listener(...args);
        }
    }

    static on<A extends [...any] = []>(service: any, event: string, listener: ServiceEventListener<A>) {
        const shadow = this.get(service, true);
        if (!shadow.listeners[event]) shadow.listeners[event] = new Set();
        shadow.listeners[event].add(listener);
        return listener;
    }

    static addRoles(service: any, ...roles: string[]) {
        this.update(service, (sys) => {
            roles.forEach((role) => sys.roles.add(role));
        });
    }
}
