import type { ModuleInit } from "./modules";
import { ServiceCtr, ServiceRegistery, ServiceCtrMap, Usable } from "./service-registery";
import { ServiceShadowInit, Shadow } from "./shadow";

/**
 * The decorated method receives the event arguments as arguments.
 * @method_decorator
 */
export function On<A extends [...any] = []>(emitter: ServiceCtr, eventType: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        Shadow.on(emitter, eventType, function (...args: any[]) {
            const listenerInstance = ServiceRegistery.getInstance(target);
            if (listenerInstance) listenerInstance[propertyKey](...args);
        });
    };
}

/**
 * The return value of the decorated method will be used as arguments for event handlers.
 * Return either a single argument or an array of arguments.
 * @method_decorator
 */
export function Emit<A extends [...any] = []>(eventType: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: any[]) {
            const result: any[] = originalMethod.apply(this, args);
            const newArgs = Array.isArray(result) ? result : result ? [result] : [];
            Shadow.emit(target, eventType, ...newArgs);
            return result;
        };
    };
}

/**
 * @class_decorator
 */
export function Module<U extends ServiceCtrMap>(init: ModuleInit<U>) {
    return function (service: ServiceCtr) {
        // register as service
        Service({ name: init.name })(service);
        Shadow.addDependency(service, "d", init.deps || {});
    };
}

/**
 * @class_decorator
 */
export function Service<S>(init: ServiceShadowInit = {}) {
    return function (service: ServiceCtr<S>) {
        Shadow.update(service, (shadow) => {
            shadow.init = init;
            shadow.name = service.name;
        });
        ServiceRegistery.register(service);
    };
}

/**
 * Injects one or more services.
 * @property_decorator
 */
export function Use(service: Usable) {
    return function (target: any, propertyKey: string) {
        Shadow.addDependency(target, propertyKey, service);
    };
}

/**
 * MArgks this method as a constructor for other services.
 * @method_decorator
 */
export function Constructor<T = any>(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addConstructor(target, propertyKey);
}

/**
 * Cacthes all thrown errors and rethrows them as the mapped error.
 * @method_decorator
 */
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

/**
 * The given services will be initialized before this service.
 * @class_decorator
 */
export function Prerequisite(...effects: ServiceCtr[]) {
    return function (ctr: any) {
        Shadow.addPrerequisite(ctr, ...effects);
    };
}

/**
 * Marks the decorated method as initializer.
 * @method_decorator
 */
export function Init(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addInitializer(target, propertyKey);
}

/**
 * @method_decorator
 */
export function Subscription(interval: number) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        setInterval(() => {
            const originalMethod = descriptor.value;
            originalMethod.apply(target);
        }, interval);
    };
}

/**
 * Deep seals the property or class.
 * @prop_decorator
 * @class_decorator
 */
export function Seal(copy = false) {
    const deepSeal = (obj: any) => {
        if (obj === null || typeof obj !== "object") return obj;

        for (const key in obj) {
            if (typeof obj[key] === "object" && obj[key] !== null) {
                deepSeal(obj[key]);
            }
        }

        return Object.seal(obj);
    };

    return function (target: any, propertyKey?: string) {
        if (!propertyKey) {
            Object.seal(target);
            Object.seal(target.prototype);
            return;
        }

        let set = false;
        let value: any;

        Object.defineProperty(target, propertyKey, {
            get: () => {
                return value;
            },
            set: (val) => {
                if (!set) {
                    set = true;
                    value = deepSeal(copy ? structuredClone(val) : val);
                }
            },
            enumerable: true,
            configurable: false,
        });
    };
}

/**
 * Deep freezes the property or class.
 * @prop_decorator
 * @class_decorator
 */
export function Freeze(copy = false) {
    const deepFreeze = (obj: any) => {
        if (obj === null || typeof obj !== "object") return obj;

        for (const key in obj) {
            if (typeof obj[key] === "object" && obj[key] !== null) {
                deepFreeze(obj[key]);
            }
        }

        return Object.freeze(obj);
    };

    return function (target: any, propertyKey?: string) {
        if (!propertyKey) {
            Object.freeze(target);
            Object.freeze(target.prototype);
            return;
        }

        let set = false;
        let value: any;

        Object.defineProperty(target, propertyKey, {
            get: () => {
                return value;
            },
            set: (val) => {
                if (!set) {
                    set = true;
                    value = deepFreeze(copy ? structuredClone(val) : val);
                }
            },
            enumerable: true,
            configurable: false,
        });
    };
}

/**
 * @method_decorator
 */
export function StoreGet(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.update(target, (shadow) => {
        shadow.storeGet = propertyKey;
    });
}

/**
 * @method_decorator
 */
export function StoreSet(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.update(target, (shadow) => {
        shadow.storeSet = propertyKey;
    });
}

/**
 * Apply this to parameters to validate them before the function is called.
 *
 * Note that this **must** also be applied to the function itself to work!
 *
 * @method_decorator
 * @param_decorator
 */
export function Val<V>(validate?: (value: V) => V) {
    return function (
        target: any,
        propertyKey: string | symbol,
        paramIndexOrDecorator: number | PropertyDescriptor
    ) {
        // If parameter: register parameter validation
        if (typeof paramIndexOrDecorator === "number") {
            Shadow.addParamData(target, propertyKey, paramIndexOrDecorator, { _validate: validate });
        }
        // If function: validate args
        else {
            const originalMethod = paramIndexOrDecorator.value;
            paramIndexOrDecorator.value = function (...args: any[]) {
                const validatedParams = Shadow.mapArgs(target, propertyKey, args, (i, arg, data) => {
                    // Use param based validate (if given)
                    if (data?._validate) {
                        return data._validate(args[i]);
                    }
                    // use function based validate (if given) to validate all parameters
                    else if (validate) {
                        return validate(args[i]);
                    }

                    return arg;
                });
                return originalMethod.apply(this, validatedParams);
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
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError(
            "Parameter Validation Error: Expected an object" + (Array.isArray(value) ? ". Got array" : "")
        );
    return value;
};
