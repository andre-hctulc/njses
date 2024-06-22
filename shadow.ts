import { randomCode } from "utils/util";
import type { ServiceCtr } from "./service-registery";

export interface ServiceShadowInit {
    eager?: boolean;
    name?: string;
    namespace?: string;
}

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomShadow {}

export interface ServiceShadow extends Partial<CustomShadow> {
    id: string;
    name: string;
    init: ServiceShadowInit;
    /** field names */
    initializers: Set<string>;
    /** field names */
    constructors: Set<string>;
    /** services (factories) */
    applyConstructors: Set<ServiceCtr>;
    /** `<fieldName, serviceId>` */
    deps: Record<string, ServiceCtr>;
    events: Record<string, Set<(...args: any) => void>>;
    ctx: Record<string, any>;
    props: Record<string, { params: Record<number, any> }>;
}

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

    static addParamData(service: any, propertyKey: string, paramIndex: number, data: object) {
        this.update(service, (sys) => {
            if (!sys.props[propertyKey]) sys.props[propertyKey] = { params: {} };
            sys.props[propertyKey].params[paramIndex] = {
                ...sys.props[propertyKey].params[paramIndex],
                ...data,
            };
        });
    }

    static getParamData(service: any, propertyKey: string, paramIndex: number): any {
        const shadow = this.get(service, true);
        return shadow.props[propertyKey]?.params[paramIndex];
    }

    static addPropData(service: any, propertyKey: string, data: object) {
        this.update(service, (sys) => {
            sys.props[propertyKey] = { ...sys.props[propertyKey], ...data };
        });
    }

    static getPropData(service: any, propertyKey: string, paramIndex: number): any {
        const shadow = this.get(service, true);
        return shadow.props[propertyKey];
    }
}
