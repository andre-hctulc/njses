import { FIELD_NAME } from "./utils/system";
import type { ModuleInit } from "./modules";
import {
    ServiceCtr,
    ServiceRegistery,
    Injectable,
    ServiceCollectionInterface,
    ServicePrototype,
    ServiceParams,
    ServiceInstance,
} from "./service-registery";
import { ShadowInit, Shadow, ParamShadow } from "./shadow";

/**
 * Modules are Services that bundle dependencies and side effects.
 * @class_decorator
 */
export function Module<U extends ServiceCollectionInterface = {}>(init: ModuleInit) {
    return function (service: ServiceCtr) {
        // register as service
        Service({ name: init.name })(service);
        if (init.sideEffects) Shadow.addSideEffect(service, ...init.sideEffects);
        if (init.roles) Shadow.addRoles(service, ...init.roles);
    };
}

/**
 * Services are classes that are initialized once and can be injected into other services.
 * @class_decorator
 */
export function Service<S extends object>(init: ShadowInit = {}) {
    return function (service: ServiceCtr<S>) {
        Shadow.update(service, (shadow) => {
            shadow.name = init.name || shadow.name;
            shadow.namespace = init.namespace || "";
            if (init) shadow.init = init;
        });
    };
}

/**
 * Services, that are initialized before the decorated service.
 *
 * **For now these services cannot have parameters!**
 * @class_decorator
 */
export function SideEffects(...effects: ServiceCtr[]) {
    return function (service: ServiceCtr) {
        Shadow.addSideEffect(service, ...effects);
    };
}

/**
 * Executes the decorated method _after_ the service is initialized.
 * @method_decorator
 */
export function Mount(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addMethod(target, FIELD_NAME.MOUNT, propertyKey);
}

/**
 * @template D Dependant
 * @prop_decorator
 */
export function Inject<S extends ServiceCtr, D extends ServiceInstance | null = null>(
    injectable: Injectable<S, D>
) {
    return function (target: ServicePrototype, propertyKey: string | symbol) {
        Shadow.addDep(target, propertyKey, injectable);
    };
}

/**
 * The decorated method receives the event arguments as arguments.
 * @method_decorator
 */
export function On<S extends ServiceCtr>(emitter: S, eventType: string, ...params: ServiceParams<S>) {
    return function (target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
        Shadow.on(emitter, eventType, function (...args: any[]) {
            const listenerInstance = ServiceRegistery.getInstance(target.constructor, params);
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
    return function (target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
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
 *
 * Factories must be static!
 * @method_decorator
 */
export function Factory<P = any>(
    target: ServicePrototype,
    propertyKey: string,
    descriptor: PropertyDescriptor
) {
    Shadow.addMethod(target, FIELD_NAME.FACTORY, propertyKey);
}

/**
 * @parameter_decorator
 */
export function MapArg<I, O>(mapArg: (arg: I, paramShadow: ParamShadow | null) => O) {
    return function (target: any, propertyKey: string, parameterIndex: number) {
        Shadow.addParam(target, propertyKey, parameterIndex, { mapArg: mapArg });
    };
}

/**
 * Maps input args to new args. if no mapper is given, registerd mappers (`MapArgs`) are used.
 * @method_decorator
 */
export function Flush<I extends [...any], O extends [...any]>(
    mapArgs?:
        | ((args: I, paramsShadow: ParamShadow | null) => O)
        | { mapEachArg: (arg: I[number], paramShadow: ParamShadow | null, args: I) => O[number] }
) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: any[]) {
            let newArgs: O;
            const paramsShadow = Shadow.getParams(target, propertyKey) || {};

            // Use given args mapper
            if (typeof mapArgs === "function") {
                newArgs = mapArgs(args as I, paramsShadow);
            }
            // use given each arg mapper
            else if (mapArgs) {
                newArgs = args.map((arg, i) => {
                    return mapArgs.mapEachArg(arg, paramsShadow[i], args as I) || null;
                }) as O;
            }
            // Use registered arg mappers
            else {
                newArgs = args.map((arg, i) => {
                    if (!paramsShadow[i]?.mapArg) return arg;
                    return paramsShadow[i].mapArg(arg, paramsShadow[i]);
                }) as O;
            }
            return originalMethod.apply(this, newArgs);
        };
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
export function Init(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addMethod(target, FIELD_NAME.INIT, propertyKey);
}

// /**
//  * Marks the decorated method as configurer. Configurers are executed before any dependencies are initialized.
//  * The decorated method receives the default module instance as argument.
//  *
//  * Can be used to define configurations for other services.
//  *
//  * @method_decorator
//  */
// export function Configure(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
//     Shadow.addMethod(target, FIELD_NAME.CONFIGURE, propertyKey);
// }

/**
 * @method_decorator
 */
export function Subscription(interval: number) {
    return function (target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
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
 * @class_decorator
 */
export function Role(...roles: string[]) {
    return function (target: ServiceCtr) {
        Shadow.addRoles(target, ...roles);
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
 * Getter for a store.
 * @method_decorator
 */
export function StoreGet(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addMethod(target, FIELD_NAME.STORE_SET, propertyKey);
}

/**
 * Setter for a store.
 * @method_decorator
 */
export function StoreSet(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addMethod(target, FIELD_NAME.STORE_GET, propertyKey);
}

/**
 * All getter for a store.
 * @method_decorator
 */
export function StoreGetAll(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addMethod(target, FIELD_NAME.STORE_GET_ALL, propertyKey);
}

/**
 * The decorated method is called when the service is destroyed.
 * @method_decorator
 */
export function Destroy(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.addMethod(target, FIELD_NAME.DESTROY, propertyKey);
}

/**
 * Apply this to parameters to validate them before the function is called.
 *
 * Note that this or `Flush` **must** also be applied to the method itself to work!
 *
 * @method_decorator
 * @param_decorator
 */
export function Val<V>(validate?: (value: V) => V) {
    return function (target: any, propertyKey: string, paramIndexOrDecorator: number | PropertyDescriptor) {
        // If parameter: register parameter validation
        if (typeof paramIndexOrDecorator === "number") {
            if (!validate) throw new Error("Parameter Validation Error: No validation function provided");
            return MapArg<V, V>(validate)(target, propertyKey, paramIndexOrDecorator);
        }
        // If function: validate args
        else {
            Flush()(target, propertyKey, paramIndexOrDecorator);
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
Val.instof = (ctr: new (...args: any) => any) => (value: any) => {
    if (!(value instanceof ctr))
        throw new TypeError(`Parameter Validation Error: Expected an instance of ${ctr.name}`);
    return value;
};