import { randomCode } from "utils/util";
import { ServiceCtr, ServiceRegistery } from "./service-registery";
import { ServiceShadowInit, updateShadow, getShadow, addParamData } from "./shadow";

// TODO event decorators @On @Emit

export function Service<S>(init: ServiceShadowInit = {}) {
    return function (service: ServiceCtr<S>) {
        const shadow = updateShadow(service, (sys) => ({ ...sys, name: init.name || randomCode(10), init }));
        ServiceRegistery.register(service);
    };
}

export function Constructor<T = any>(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    updateShadow(target, (shadow) => {
        shadow.constructors.add(propertyKey);
    });
}

export function Throws<E extends Error>(error: (err: unknown) => E) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: any[]) {
            try {
                return originalMethod.apply(this, args);
            } catch (err) {
                throw error(err);
            }
        };

        return descriptor;
    };
}

export function Use<S>(service: new () => S) {
    return function (target: any, propertyKey: string) {
        updateShadow(target, (shadow) => {
            shadow.deps[propertyKey] = service;
        });
    };
}

export function Init(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    updateShadow(target, (shadow) => {
        shadow.initializers.add(propertyKey);
    });
}

export function Subscription(interval: number) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        setInterval(() => {
            const originalMethod = descriptor.value;
            originalMethod.apply(target);
        }, interval);
    };
}

/**
 * Apply this to parameters to validate them before the function is called.
 *
 * Note that this **must** also be applied to the function itself to work!
 */
export function Val<V>(validate?: (value: V) => V) {
    return function (
        target: any,
        propertyKey: string | symbol,
        paramIndexOrDecorator: number | PropertyDescriptor
    ) {
        // If parameter: register parameter validation
        if (typeof paramIndexOrDecorator === "number") {
            addParamData(target, propertyKey as string, paramIndexOrDecorator, { _val: validate });
        }
        // If function: validate args
        else {
            const originalMethod = paramIndexOrDecorator.value;
            paramIndexOrDecorator.value = function (...args: any[]) {
                const shadow = getShadow(target, true);
                const params = [...args];
                if (shadow.props[propertyKey as string] || validate) {
                    for (let i = 0; i < args.length; i++) {
                        const paramData: any = shadow.props[propertyKey as string].params[i];
                        // use parameter validate first
                        if (paramData?._val) {
                            params[i] = paramData._val(args[i]);
                        }
                        // use function based validate (if given) to validate all parameters
                        else if (validate) {
                            params[i] = validate(args[i]);
                        }
                    }
                }
                return originalMethod.apply(this, params);
            };
        }
    };
}

Val.str = (value: string) => {
    if (typeof value !== "string") throw new TypeError("Parameter Validation Error: Expected a string");
    return value;
};
Val.num = (value: number) => {
    if (typeof value !== "number") throw new TypeError("Parameter Validation Error: Expected a number");
    return value;
};
Val.bool = (value: boolean) => {
    if (typeof value !== "boolean") throw new TypeError("Parameter Validation Error: Expected a boolean");
    return value;
};
Val.arr = (value: any[]) => {
    if (!Array.isArray(value)) throw new TypeError("Parameter Validation Error: Expected an array");
    return value;
};
Val.obj = (value: object) => {
    if (!value || typeof value !== "object")
        throw new TypeError("Parameter Validation Error: Expected an object");
    return value;
};
