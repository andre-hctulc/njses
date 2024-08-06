import type { Instance } from "../main/service-registery";
import { Service, Inject } from "../main/decorators";
import { Store } from "./store";

@Service({ name: "$$Config" })
export class Config {
    readonly NODE_ENV = process.env.NODE_ENV || "";

    /** memory Map */
    private _mem: Map<string, any> = new Map();

    @Inject(Store)
    private _storeService!: Store;

    /**
     * @param required checks for null or undefined
     */
    get<R extends boolean = false>(key: string, required?: R): any {
        const value = this._mem.get(key);
        if (required && value == null) throw new Error(`Config for "${key}" is required but not set.`);
        return value;
    }

    /**
     * @throws Error if value is not parseable to a number
     */
    getStr<R extends boolean = false>(
        key: string,
        required?: R
    ): R extends true ? string : string | undefined {
        const stored = this.get(key, required);
        if (stored === undefined) return undefined as any;
        return String(stored);
    }

    /**
     * @throws Error if value is not parseable to a number
     */
    getNum<R extends boolean = false>(
        key: string,
        required?: R
    ): R extends true ? number : number | undefined {
        const stored = this.get(key, required);
        if (stored === undefined) return undefined as any;
        const num = Number(stored);
        if (isNaN(num)) throw new Error(`Config for "${key}" is not a number.`);
        return num;
    }

    /**
     * @returns true if value is true, "true", "TRUE", 1, or "1", undefined if not found, false otherwise
     */
    getBool<R extends boolean = false>(
        key: string,
        required?: R
    ): R extends true ? boolean : boolean | undefined {
        const num = this.get(key, required);
        if (num === undefined) return undefined as any;
        return num === true || num === 1 || num === "true" || num === "TRUE" || num === "1";
    }

    async set<T = any>(key: string, value: T, store = false) {
        this._mem.set(key, value);
        if (store && this._store) await this._storeService.set(this._store, key, value);
    }

    setSync<T = any>(key: string, value: T, store = false) {
        this._mem.set(key, value);
        if (store && this._store) this._storeService.set(this._store, key, value);
    }

    setMany(values: Record<string, any>, store = false) {
        return Promise.all(Object.entries(values).map(([key, value]) => this.set(key, value, store)));
    }

    setManySync(values: Record<string, any>, store = false) {
        for (const key in values) {
            this.setSync(key, values[key], store);
        }
    }

    /**
     * Loads all environment variables into memory
     */
    loadEnv() {
        return this.setMany(process.env);
    }

    loadEnvSync() {
        this.setMany(process.env);
    }

    private _store: any;

    /**
     * @param load If true, loads all stored values into memory
     */
    async setStore(storesService: Instance, load = true) {
        this._store = storesService;
        const all = await this._storeService.getAll(this._store);
        if (load) {
            await this.loadStore(storesService);
        }
    }

    /**
     * Loads all stored values into memory
     */
    async loadStore(storesService: Instance) {
        const all = await this._storeService.getAll(storesService);
        await this.setMany(all.reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}));
    }

    get store() {
        return this._store;
    }
}
