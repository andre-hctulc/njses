import type { ComponentCtr, Instance, Injectable } from "./registery";
import { NJSESError } from "./errors";
import { merge } from "../utils/util";
import { Reflection } from "../utils/reflection";

/** Property or Method */
type Field = string | symbol;

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomShadowInit {}

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomFieldShadow {}

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomShadowParam {}

/**
 * Use module augmentation to extend this interface.
 */
export interface CustomShadowContext {}

/** Adds _$_ prefix to custom properties. */
type ShadowExtension<I extends object = {}> = {
    [K in keyof I as `$${string & K}`]?: I[K];
};

/** Method or Field */
export type FieldShadow = {
    field: string | symbol;
    params: Record<number, ParamShadow>;
    method: boolean;
} & ShadowExtension<CustomFieldShadow>;

export type ParamShadow = {
    mapArg?: (arg: any, param: ParamShadow) => any;
} & ShadowExtension<CustomShadowParam>;

export interface DefaultShadowInit {
    name: string;
    dynamic?: boolean;
    namespace?: string;
}

export type ShadowInit = DefaultShadowInit & ShadowExtension<CustomShadowInit>;
export type ShadowContext = ShadowExtension<CustomShadowContext>;
type FieldsShadow = Record<string | symbol, FieldShadow>;

type EventHandler<A extends [...any] = []> = (this: Instance<any>, ...args: A) => void;

const SHADOW_SYMBOL = "$hadow";

const getCtr = (source: any) => {
    // Class ctr
    if (typeof source === "function") return source;
    // Instance or prototype
    else return source.constructor;
    // // Instance
    // else if (service instanceof Object && service.prototype) return service.constructor;
    // // Prototype
    // else return service.constructor;
};

export class Shadow {
    static create(source: any, init: ShadowInit): ShadowInit {
        const ctr = getCtr(source);
        const shadow = new Shadow(ctr, init);
        ctr[SHADOW_SYMBOL] = shadow;
        return shadow;
    }

    static require(source: any): Shadow {
        const shadow = Shadow.get(source);
        if (!shadow) throw new NJSESError("Shadow not found");
        return shadow;
    }

    static get(source: any): Shadow | null {
        return source[SHADOW_SYMBOL] || null;
    }

    /**
     * Merges all shadows into the target shadow.
     */
    static merge(target: Shadow, shadows: Shadow[]) {
        shadows.forEach((ctr) => {
            const shadow = Shadow.get(ctr);
            if (!shadow) return;
            for (const key in shadow) {
                if (!key.startsWith("_")) continue;
                (target as any)[key] = merge((target as any)[key], (shadow as any)[key]);
            }
        });
    }

    readonly name: string;
    readonly namespace: string;
    readonly isEntity: boolean;

    // IMP Fields that should be merged must be prefixed with an underscore! See Shadow.merge

    /** List of roles */
    private _roles: Set<string> = new Set();
    /** prerequisites that do not need to be injected  */
    private _sideEffects: Set<ComponentCtr<any>> = new Set();
    /** `<field, usable+params>` */
    private _injections: Record<Field, Injectable> = {};
    /** Define some context */
    private _ctx: ShadowContext = {};
    /** Stores data for each field (property or method) and it's params */
    private _fields: FieldsShadow = {};
    /** <fieldType, fields> - Can be used to memorize special fields. e.g. options */
    private _props: Record<string, Set<Field>> = {};
    /** <methodType, methods> - Can be used to memorize special methods. e.g. initializers   */
    private _methods: Record<string, Set<string>> = {};
    /** Registerd event listeners */
    private _listeners: Record<string, Set<EventHandler<any>>> = {};
    private _init: ShadowInit;

    constructor(serviceCtr: ComponentCtr, init: ShadowInit) {
        this.name = init.name;
        this.namespace = init.namespace || "";
        this.isEntity = !!init.dynamic;
        this._init = init;
        // extend base shadow
        const chain = Reflection.ctrChain(serviceCtr);
        chain.shift();
        Shadow.merge(this, chain.map((ctr) => Shadow.get(ctr)).filter((s) => !!s) as Shadow[]);
    }

    get init(): ShadowInit {
        return this._init;
    }

    addInjection(field: Field, dep: Injectable): void {
        this._injections[field] = dep;
    }

    getInjection(field: string): Injectable | null {
        return this._injections[field] || null;
    }

    getInjections(): Record<Field, Injectable> {
        return this._injections;
    }

    addSideEffects(...effects: ComponentCtr[]): void {
        effects.forEach((c) => this._sideEffects.add(c));
    }

    getSideEffects(): ComponentCtr[] {
        return Array.from(this._sideEffects);
    }

    setCtx<K extends keyof ShadowContext>(key: K, value: ShadowContext[K]): void {
        this._ctx[key] = value;
    }

    getCtx<K extends keyof ShadowContext>(key: K): ShadowContext[K] {
        return this._ctx[key];
    }

    getField(propertyKey: Field): FieldShadow | null {
        return this._fields[propertyKey];
    }

    getFields(): FieldShadow[] {
        return Object.values(this._fields);
    }

    hasField(propertyKey: Field): boolean {
        return !!this._fields[propertyKey];
    }

    getParam(propertyKey: Field, paramIndex: number): ParamShadow | null {
        return this._fields[propertyKey]?.params[paramIndex] || null;
    }

    getParams(propertyKey: Field): FieldShadow["params"] | null {
        const prop = this.getField(propertyKey);
        return prop?.params || null;
    }

    addField(propertyKey: Field, data: Partial<FieldShadow>) {
        this._fields[propertyKey] = {
            field: propertyKey as string,
            method: false,
            ...(this._fields[propertyKey] as Partial<FieldShadow>),
            ...data,
            params: { ...this._fields[propertyKey]?.params, ...data.params },
        };
    }

    addParam(propertyKey: Field, paramIndex: number, data: ParamShadow) {
        if (!this._fields[propertyKey])
            this._fields[propertyKey] = { field: propertyKey, params: {}, method: true };
        this._fields[propertyKey].params[paramIndex] = {
            ...this._fields[propertyKey]?.params[paramIndex],
            ...data,
        };
    }

    forEachArg(
        propertyKey: Field,
        receivedArgs: any[],
        callback: (arg: any, param: ParamShadow | null, index: number) => void
    ) {
        this.mapArgs(propertyKey, receivedArgs, callback);
    }

    /**
     * Map over given arguments and their shadow.
     */
    mapArgs<I extends [...any], O extends [...any]>(
        propertyKey: Field,
        receivedArgs: I,
        callback: (arg: any, param: ParamShadow | null, index: number) => O[number]
    ): O {
        const mapped: O = [] as any;
        const params = this.getParams(propertyKey) || {};
        const len = Math.max(receivedArgs.length, Object.keys(params).length);

        for (let i = 0; i < len; i++) {
            const arg = receivedArgs[i];
            const param = params[i] || null;
            mapped.push(callback(arg, param, i));
        }
        return mapped;
    }

    addProp(type: string, field: Field) {
        if (!this._props[type]) this._props[type] = new Set();
        this._props[type].add(field);
    }

    getProps(type: string): Field[] {
        return Array.from(this._props[type] || []);
    }

    /**
     * @returns The _first_ property of the given type
     */
    getProp<R extends boolean = false>(type: string, required?: R): R extends true ? Field : Field | null {
        const first = this._props[type].values().next().value;
        if (required && first == null) throw new NJSESError(`No field of type "${type}"`);
        return (first as any) || null;
    }

    addMethod(type: string, method: string) {
        if (!this._methods[type]) this._methods[type] = new Set();
        this._methods[type].add(method);
    }

    getMethods(type: string): string[] {
        return Array.from(this._methods[type] || []);
    }

    /**
     * @returns The _first_ method of the given type
     */
    getMethod<R extends boolean = false>(
        type: string,
        required?: R
    ): R extends true ? string : string | null {
        const first = this._methods[type].values().next().value;
        if (required && first == null) throw new NJSESError(`No method of type "${type}"`);
        return (first as any) || null;
    }

    emit<A extends [...any] = []>(event: string, ...args: A) {
        const listeners = this._listeners[event];
        if (!listeners) return;
        for (const listener of Array.from(listeners)) {
            listener(...args);
        }
    }

    on<A extends [...any] = []>(event: string, listener: EventHandler<A>) {
        if (!this._listeners[event]) this._listeners[event] = new Set();
        this._listeners[event].add(listener);
        return listener;
    }

    addRoles(...roles: string[]) {
        roles.forEach((role) => this._roles.add(role));
    }

    getRoles(): string[] {
        return Array.from(this._roles);
    }

    hasRole(role: string): boolean {
        return this._roles.has(role);
    }
}
