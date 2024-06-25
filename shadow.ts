import type { ServiceCtr } from "./service-registery";
import { randomId } from "./system";

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
    id: string;
    name: string;
    init: Partial<
        // default init
        {
            eager: boolean;
            name: string;
            namespace: string;
        } & CustomShadowInit
    >;
    /** methods */
    initializers: Set<string>;
    /** methods */
    constructors: Set<string>;
    /** services (factories) */
    applyConstructors: Set<ServiceCtr>;
    /** `<field, service>` */
    deps: Record<string, ServiceCtr>;
    /** services - Dependencies, that do not need to be injected */
    sideEffects: Set<ServiceCtr>;
    listeners: Record<string, Set<ServiceEventListener<any>>>;
    ctx: Record<string, any>;
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
    storeGet?: string | symbol;
    storeSet?: string | symbol;
}

export type ShadowPropData = ServiceShadow["props"][string];
export type ShadowParamData = ShadowPropData["params"][number];
export type ServiceShadowInit = ServiceShadow["init"];

export type ServiceEventListener<A extends [...any] = []> = (...args: A) => void;

const SHADOW_SYMBOL = Symbol("$hadow");

/** Default event types are prefixed with '$' */
export enum ServiceEvent {
    MOUNT = "$mount",
}

export abstract class Shadow {
    static get<R extends boolean = false>(
        service: any,
        required?: R
    ): R extends true ? ServiceShadow : ServiceShadow | null {
        if (typeof service === "object") service = service.constructor;
        const sys = (service as any)?.[SHADOW_SYMBOL];
        if (required && !sys) throw new Error("Not a service");
        return sys || null;
    }

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
                initializers: new Set(),
                constructors: new Set(),
                applyConstructors: new Set(),
                listeners: {},
                init: {},
                ctx: {},
                props: {},
                sideEffects: new Set(),
            };
        }
        shadow = mutate(shadow) || shadow;
        (service as any)[SHADOW_SYMBOL] = shadow;
        return shadow;
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

    static removeListener(service: any, event: string, listener: (...args: any) => any) {
        const shadow = this.get(service, true);
        if (!shadow.listeners[event]) return;
        shadow.listeners[event].delete(listener);
    }

    static setCtx(service: any, key: string, value: any) {
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

    static addInitializer(service: any, fieldName: string) {
        this.update(service, (sys) => {
            sys.initializers.add(fieldName);
        });
    }

    static addConstructor(service: any, fieldName: string) {
        this.update(service, (sys) => {
            sys.constructors.add(fieldName);
        });
    }

    static addApplyConstructor(service: any, ctr: ServiceCtr) {
        this.update(service, (sys) => {
            sys.applyConstructors.add(ctr);
        });
    }

    static addDependency(service: any, fieldName: string, dep: ServiceCtr) {
        this.update(service, (sys) => {
            sys.deps[fieldName] = dep;
        });
    }

    static addSideEfects(service: any, ...effects: ServiceCtr[]) {
        this.update(service, (sys) => {
            effects.forEach((c) => sys.sideEffects.add(c));
        });
    }
}
