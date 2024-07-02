import type { ModuleInit } from "./modules";
import { ServiceCtr, ServiceRegistery, Usable, ServiceCollectionInterface } from "./service-registery";
import { ShadowInit, Shadow } from "./shadow";
import { FIELD_NAME } from "./system";

/**
 * Modules are Services that bundle dependencies and side effects.
 * @class_decorator
 */
export function Module<U extends ServiceCollectionInterface>(init: ModuleInit<U>) {
    return function (service: ServiceCtr) {
        // register as service
        Service({ name: init.name })(service);
        Shadow.addDep(service, "d", init.deps || {});
        if (init.sideEffects) Shadow.addSideEffect(service, ...init.sideEffects);
    };
}

/**
 * Services are classes that are initialized once and can be injected into other services.
 * @class_decorator
 */
export function Service<S>(init: ShadowInit = {}) {
    return function (service: ServiceCtr<S>) {
        Shadow.update(service, (shadow) => {
            shadow.init = init;
            shadow.name = service.name;
        });
        ServiceRegistery.register(service);
    };
}

/**
 * Executes the decorated method after the service is initialized.
 * @method_decorator
 */
export function Mount(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addMethod(target, FIELD_NAME.MOUNT, propertyKey);
}

/**
 * Passes as parameters to factory methods. You must return an array of parameters.
 * @method_decorator
 * @prop_decorator
 */
export function Use<U extends Usable>(usable: U) {
    return function (target: any, propertyKey: string | symbol) {
        Shadow.addDep(target, propertyKey, usable);
    };
}

/**
 * The decorated method receives the event arguments as arguments.
 * @method_decorator
 */
export function On<A extends [...any] = []>(emitter: ServiceCtr, eventType: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        Shadow.on(emitter, eventType, function (...args: any[]) {
            const listenerInstance = ServiceRegistery.getInstance(target);
            if (listenerInstance) ServiceRegistery.resolve(target, propertyKey, args);
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
 * Factories are used to create instances of a service, called products. Factory methods are applied to the service instance.
 * The factory receive the service instance and possible parameters (`FactoryParams`) to extend the instance.
 * @method_decorator
 */
export function Factory<P = any>(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addMethod(target, FIELD_NAME.FACTORY, propertyKey);
}

/**
 * Passes as parameters to factory methods. You must return an array of parameters.
 * @method_decorator
 * @prop_decorator
 */
export function ProductParams<F = any>(factory: ServiceCtr<F>) {
    return function (target: any, propertyKey: string | symbol) {
        Shadow.update(target, (shadow) => {
            Shadow.setProductParam(factory, target, propertyKey);
        });
    };
}

/**
 * Passes as parameters to factory methods. You must return an array of parameters.
 * @method_decorator
 */
export function Product<F = any>(factory: ServiceCtr<F>) {
    return function (target: any) {
        Shadow.update(target, (shadow) => {
            Shadow.addFactory(factory, target);
        });
    };
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
 * Marks the decorated method as initializer.
 * @method_decorator
 */
export function Init(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addMethod(target, FIELD_NAME.INIT, propertyKey);
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
    Shadow.addMethod(target, FIELD_NAME.STORE_SET, propertyKey);
}

/**
 * @method_decorator
 */
export function StoreSet(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addMethod(target, FIELD_NAME.STORE_GET, propertyKey);
}

/**
 * @method_decorator
 */
export function StoreGetAll(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addMethod(target, FIELD_NAME.STORE_GET_ALL, propertyKey);
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
