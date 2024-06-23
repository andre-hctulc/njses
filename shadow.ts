import { randomCode } from "utils/util";
import type { ServiceCtr } from "./service-registery";

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
    /** field names */
    initializers: Set<string>;
    /** field names */
    constructors: Set<string>;
    /** services (factories) */
    applyConstructors: Set<ServiceCtr>;
    /** `<fieldName, serviceId>` */
    deps: Record<string, ServiceCtr>;
    /** Dependencies, that do not need to be injected */
    sideEffects: Set<ServiceCtr>;
    events: Record<string, Set<(...args: any) => void>>;
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
}

export type ShadowPropData = ServiceShadow["props"][string];
export type ShadowParamData = ShadowPropData["params"][number];
export type ServiceShadowInit = ServiceShadow["init"];

const SHADOW_SYMBOL = Symbol("$hadow");

export interface ServiceEvents {
    mount: () => void;
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
        if (typeof service === "object") service = service.constructor;
        let shadow: undefined | ServiceShadow = (service as any)[SHADOW_SYMBOL];
        // init shadow if not exists
        if (!shadow) {
            shadow = {
                name: "",
                id: randomCode(10),
                deps: {},
                initializers: new Set(),
                constructors: new Set(),
                applyConstructors: new Set(),
                events: {},
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

    static dispatchEvent<E extends keyof ServiceEvents>(
        service: any,
        event: E,
        ...args: Parameters<ServiceEvents[E]>
    ) {
        const shadow = this.get(service, true);
        const listeners = shadow.events[event];
        if (!listeners) return;
        for (const listener of listeners) {
            listener(...args);
        }
    }

    static addEventListener(service: any, event: string, listener: (...args: any) => any) {
        const shadow = this.get(service, true);
        if (!shadow.events[event]) shadow.events[event] = new Set();
        shadow.events[event].add(listener);
    }

    static removeEventListener(service: any, event: string, listener: (...args: any) => any) {
        const shadow = this.get(service, true);
        if (!shadow.events[event]) return;
        shadow.events[event].delete(listener);
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
                ...sys.props[propertyKey].params[paramIndex],
                ...data,
            };
        });
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
                params: { ...sys.props[propertyKey].params, ...data.params },
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
