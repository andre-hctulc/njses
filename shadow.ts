import type { ServiceCtr, ServiceInstance, Usable } from "./service-registery";
import { randomId } from "./system";

type Field = string | symbol;

export interface DefaultShadowInit {
    eager?: boolean;
    name?: string;
    namespace?: string;
}

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomShadow {}

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomShadowInit {}

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomShadowProp {}

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomShadowParam {}

export interface ServiceShadow extends Partial<CustomShadow> {
    /** Service id */
    id: string;
    /** Service name */
    name: string;
    /** Service init */
    init: DefaultShadowInit & Partial<CustomShadow>;
    /** services (factories) */
    productOf: Set<ServiceCtr>;
    /** <factory, field/method>  */
    productParams: Map<ServiceCtr, Field>;
    /** prerequisites that do not need to be injected  */
    sideEffects: Set<ServiceCtr>;
    /** `<field, serviceId>` */
    deps: Record<Field, Usable>;
    ctx: Record<string, any>;
    /** Stores data for each prop (field or method) and it's params */
    props: Record<
        string | symbol,
        // default prop
        {
            field: string | symbol;
            params: Record<
                number,
                // default param
                {
                    _validate?: any;
                } & Partial<CustomShadowParam>
            >;
            method: boolean;
        } & Partial<CustomShadowProp>
    >;
    /** <fieldType, fields> - Can be used to memorize special fields. e.g. options */
    fields: Record<string, Set<Field>>;
    /** <methodType, methods> - Can be used to memorize special methods. e.g. initializers   */
    methods: Record<string, Set<string>>;
    /** Events */
    events: Record<string, Set<(...args: any) => void>>;
    /** Registerd event listeners */
    listeners: Record<string, Set<ServiceEventListener<any>>>;
}

export type ShadowPropData = ServiceShadow["props"][string];
export type ShadowParamData = ShadowPropData["params"][number];
export type ShadowInit = ServiceShadow["init"];

export type ServiceEventListener<A extends [...any] = []> = (this: ServiceInstance<any>, ...args: A) => void;

const SHADOW_SYMBOL = Symbol("$hadow");

/** Default event types are prefixed with '$' */
export enum ServiceEvent {
    MOUNT = "$mount",
}

export abstract class Shadow {
    /** Retrieves the shadow of the given service */
    static get<R extends boolean = false>(
        service: any,
        required?: R
    ): R extends true ? ServiceShadow : ServiceShadow | null {
        if (typeof service === "object") service = service.constructor;
        const sys = (service as any)?.[SHADOW_SYMBOL];
        if (required && !sys) throw new Error("Not a service");
        return sys || null;
    }

    /** Updates the shadow of the given service */
    static update(service: any, mutate: (sys: ServiceShadow) => ServiceShadow | void): ServiceShadow {
        if (typeof service === "object") service = service?.constructor;
        if (!service) throw new Error("Not a valid service base");
        let shadow: undefined | ServiceShadow = (service as any)[SHADOW_SYMBOL];
        // init shadow if not exists
        if (!shadow) {
            shadow = {
                name: "",
                id: randomId(),
                deps: {},
                productOf: new Set(),
                productParams: new Map(),
                events: {},
                init: {} as any,
                ctx: {},
                props: {},
                listeners: {},
                sideEffects: new Set(),
                fields: {},
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

    static getPropData(service: any, propertyKey: string | symbol): ShadowPropData | null {
        const shadow = this.get(service, true);
        return shadow.props[propertyKey];
    }

    static hasProp(service: any, propertyKey: string | symbol): boolean {
        const shadow = this.get(service, true);
        return !!shadow.props[propertyKey];
    }

    static getParamData(
        service: any,
        propertyKey: string | symbol,
        paramIndex: number
    ): ShadowParamData | null {
        const shadow = this.get(service, true);
        return shadow.props[propertyKey]?.params[paramIndex] || null;
    }

    static getParams(service: any, propertyKey: string | symbol): ShadowPropData["params"] | null {
        const prop = this.getPropData(service, propertyKey);
        return prop?.params || null;
    }

    static addPropData(service: any, propertyKey: string | symbol, data: Partial<ShadowPropData>) {
        this.update(service, (sys) => {
            sys.props[propertyKey] = {
                field: propertyKey as string,
                method: false,
                ...(sys.props[propertyKey] as Partial<ShadowPropData>),
                ...data,
                params: { ...sys.props[propertyKey]?.params, ...data.params },
            };
        });
    }

    static addParamData(
        service: any,
        propertyKey: string | symbol,
        paramIndex: number,
        data: ShadowParamData
    ) {
        this.update(service, (sys) => {
            if (!sys.props[propertyKey])
                sys.props[propertyKey] = { field: propertyKey, params: {}, method: true };
            sys.props[propertyKey].params[paramIndex] = {
                ...sys.props[propertyKey]?.params[paramIndex],
                ...data,
            };
        });
    }

    static forEachArg(
        service: any,
        propertyKey: string | symbol,
        args: any[],
        callback: (index: number, arg: any, paramData: ShadowParamData | null) => void
    ) {
        this.mapArgs(service, propertyKey, args, callback);
    }

    static mapArgs<T>(
        service: any,
        propertyKey: string | symbol,
        args: any[],
        callback: (index: number, arg: any, paramData: ShadowParamData | null) => T
    ): T[] {
        const mapped: T[] = [...args];
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            const data = this.getParamData(service, propertyKey, i);
            if (data) mapped.push(callback(i, arg, data));
        }
        return mapped;
    }

    static addField(service: any, type: string, field: Field) {
        this.update(service, (sys) => {
            if (!sys.fields[type]) sys.fields[type] = new Set();
            sys.fields[type].add(field);
        });
    }

    static getFields(service: any, type: string): Field[] {
        const shadow = this.get(service, true);
        return Array.from(shadow.fields[type]);
    }

    static getField<R extends boolean = false>(
        service: any,
        type: string,
        required?: R
    ): R extends true ? Field : Field | null {
        const shadow = this.get(service, true);
        const first = shadow.fields[type].values().next().value;
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
        return Array.from(shadow.methods[type]);
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
}
