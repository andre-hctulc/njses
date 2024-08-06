import type { ModuleInit } from "./modules";
import { ServiceCtr, App, Injectable, ServicePrototype, Instance } from "./service-registery";
import { ShadowInit as ShadowInit, Shadow, ParamShadow } from "./shadow";
import type { OP } from "../utils/types";
import { NJSESError } from "./errors";
import { FIELD_NAME, ROLE_NAME } from "./system";

// --- Registery ---

/**
 * @class_decorator
 */
export function Service(init: Omit<ShadowInit, "dynamic">) {
    return function (service: ServiceCtr) {
        Shadow.create(service, { ...init, dynamic: false });
    };
}

/**
 * @class_decorator
 */
export function Entity(init: Omit<ShadowInit, "dynamic">) {
    return function (service: ServiceCtr) {
        Shadow.create(service, { ...init, dynamic: true });
    };
}

/**
 * Modules are special kind of Services that bundle some common service functionality.
 * @class_decorator
 */
export function Module(init: ModuleInit) {
    return function (service: ServiceCtr) {
        // register as service
        Service({ name: init.name })(service);
        const shadow = Shadow.require(service);
        if (init.sideEffects) shadow.addSideEffects(...init.sideEffects);
        if (init.roles) shadow.addRoles(...init.roles);
    };
}

/**
 * Assigns roles to the decorated service.
 *
 * Roles can only be assigned to services!
 * @class_decorator
 */
export function Role(...roles: string[]) {
    return function (target: ServiceCtr) {
        const shadow = Shadow.require(target);
        if (shadow.isEntity) throw new NJSESError("Roles can only be assigned to services");
        shadow.addRoles(...roles);
    };
}

// --- Dependencies ---

/**
 * Services, that are initialized before the decorated service.
 *
 * **For now these services cannot have parameters!**
 * @class_decorator
 */
export function SideEffects(...effects: ServiceCtr[]) {
    return function (target: ServiceCtr) {
        Shadow.require(target).addSideEffects(...effects);
    };
}

/**
 * @template D Dependant
 * @prop_decorator
 */
export function Inject<S extends ServiceCtr, D extends Instance | null = null>(injectable: Injectable<S, D>) {
    return function (target: ServicePrototype, propertyKey: string | symbol) {
        Shadow.require(target).addInjection(propertyKey, injectable);
    };
}

// --- Lifecycle ---

export type Init = () => any;

/**
 * Marks the decorated method as initializer.
 * @method_decorator
 */
export function Init(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.INIT, propertyKey);
}

export type Mount = () => any;

/**
 * Executes the decorated method _after_ the service is initialized.
 * @method_decorator
 */
export function Mount(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.MOUNT, propertyKey);
}

export type Destroy = (reason: unknown) => any;

/**
 * The decorated method is called when the service is destroyed.
 * @method_decorator
 */
export function Destroy(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.DESTROY, propertyKey);
}

export type On = (service: ServiceCtr, eventType: string) => any;

// --- Events ---

/**
 * The decorated method receives the event arguments as arguments.
 * @method_decorator
 */
export function On(emitter: ServiceCtr, eventType: string) {
    return function (target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
        Shadow.require(emitter).on(eventType, (...args: any[]) => {
            App.invoke(target, propertyKey, args);
        });
    };
}

export type Emit = (...args: any) => any;

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
            Shadow.require(target).emit(eventType, ...newArgs);
            return result;
        };
    };
}

// --- Method transformations ---

/**
 * @parameter_decorator
 */
export function MapArg<I, O>(mapArg: (arg: I, paramShadow: ParamShadow | null) => O) {
    return function (target: any, propertyKey: string, parameterIndex: number) {
        Shadow.require(target).addParam(propertyKey, parameterIndex, { mapArg: mapArg });
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
            const paramsShadow = Shadow.require(target).getParams(propertyKey) || {};

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
 * @method_decorator
 */
export function Periodic(interval: number) {
    return function (target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
        setInterval(() => {
            const originalMethod = descriptor.value;
            originalMethod.apply(target);
        }, interval);
    };
}

// --- Config ---

export type Configure = () => OP<void | [option: string, value: any] | [option: string, value: any][]>;

/**
 * Called after all dependencies are injected and before initialization.
 * Can be used to configure other services.
 * @method_decorator
 */
export function Configure(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.CONFIGURE, propertyKey);
}

// --- Seal/Freeze  ---

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

// --- Store ---

export type StoreGet = (id: string) => any;

/**
 * Getter for a store.
 * @method_decorator
 */
export function StoreGet(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.STORE_SET, propertyKey);
}

export type StoreSet = (id: string, value: string) => void;

/**
 * Setter for a store.
 * @method_decorator
 */
export function StoreSet(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.STORE_GET, propertyKey);
}

export type StoreGetAll = () => OP<[id: string, value: any][]>;

/**
 * All getter for a store.
 * @method_decorator
 */
export function StoreGetAll(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.STORE_GET_ALL, propertyKey);
}

// --- Repository ---

/**
 * @class_decorator
 */
export function Repo(target: ServiceCtr) {
    Shadow.require(target).addRoles(ROLE_NAME.REPO);
}

export type Find<I, D> = (id: I) => OP<D>;

/**
 * @method_decorator
 */
export function Find(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.REPO_FIND, propertyKey);
}

export type FindFirst<Q, D> = (query: Q) => OP<D | null>;

/**
 * @method_decorator
 */
export function FindFirst(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.REPO_FIND_FIRST, propertyKey);
}

export type FindMany<Q, D> = (query: Q) => OP<D[]>;

/**
 * @method_decorator
 */
export function FindMany(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.REPO_FIND_MANY, propertyKey);
}

export type Create<I, D> = (value: Partial<D>) => OP<I>;

/**
 * @method_decorator
 */
export function Create(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.REPO_CREATE, propertyKey);
}

export type CreateMany<I, D> = (values: Partial<D>[]) => OP<I[]>;

/**
 * @method_decorator
 */
export function CreateMany(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.REPO_CREATE_MANY, propertyKey);
}

export type Delete<I> = (id: I) => void;

/**
 * @method_decorator
 */
export function Delete(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.REPO_DELETE, propertyKey);
}

export type DeleteMany<I, Q> = (query: Q) => OP<I[]>;

/**
 * @method_decorator
 */
export function DeleteMany(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.REPO_DELETE_MANY, propertyKey);
}

export type Update<I, T> = (id: I, value: Partial<T>) => void;

/**
 * @method_decorator
 */
export function Update(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.REPO_UPDATE, propertyKey);
}

export type UpdateMany<I, Q, D> = (query: Q, data: Partial<D>) => OP<I[]>;

/**
 * @method_decorator
 */
export function UpdateMany(target: ServicePrototype, propertyKey: string, descriptor: PropertyDescriptor) {
    Shadow.require(target).addMethod(FIELD_NAME.REPO_UPDATE_MANY, propertyKey);
}

// --- Val ---

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
