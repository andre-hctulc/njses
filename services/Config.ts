import { Service, Use } from "../decorators";
import type { ServiceInstance } from "../service-registery";
import { Store } from "./store";

@Service({ name: "$$Config" })
export class Config {
    readonly NODE_ENV = process.env.NODE_ENV || "";

    /** memory Map */
    private _mem: Map<string, any> = new Map();

    @Use(Store)
    private _storeService!: Store;

    /**
     * @param required checks for null or undefined
     */
    get<T = any>(key: string, required = false): T | undefined {
        const value = this._mem.get(key);
        if (required && value == null) throw new Error(`Config for "${key}" is required but not set.`);
        return value;
    }

    /**
     * @throws Error if value is not parseable to a number
     */
    getNum(key: string, required = false): number | undefined {
        const stored = this.get(key, required);
        if (stored === undefined) return undefined;
        const num = Number(stored);
        if (isNaN(num)) throw new Error(`Config for "${key}" is not a number.`);
        return num;
    }

    /**
     * @returns true if value is true, "true", "TRUE", 1, or "1", undefined if not found, false otherwise
     */
    getBool(key: string, required = false): boolean | undefined {
        const num = this.get(key, required);
        if (num === undefined) return undefined;
        return num === true || num === 1 || num === "true" || num === "TRUE" || num === "1";
    }

    /**
     * @param store Sync with store?
     */
    async set<T = any>(key: string, value: T, store = false) {
        this._mem.set(key, value);
        if (store && this._store) await this._storeService.set(this._store, key, value);
    }

    /**
     * @param store Sync with store?
     */
    setSync<T = any>(key: string, value: T, store = false) {
        this._mem.set(key, value);
        if (store && this._store) this._storeService.set(this._store, key, value);
    }

    /**
     * @param store Sync with store?
     */
    async setMany(values: Record<string, any>, store = false) {
        for (const key in values) {
            await this.set(key, values[key], store);
        }
    }

    /**
     * @param store Sync with store?
     */
    setManySync(values: Record<string, any>, store = false) {
        for (const key in values) {
            this.setSync(key, values[key], store);
        }
    }

    /**
     * Loads all environment variables into memory
     */
    loadEnv() {
        for (const key in process.env) {
            this.set(key, process.env[key]);
        }
    }

    private _store: any;

    /**
     * @param load If true, loads all stored values into memory
     */
    async setStore(storesService: ServiceInstance, load = true) {
        this._store = storesService;
        const all = await this._storeService.getAll(this._store);
        if (load) {
            await this.loadStore(storesService);
        }
    }

    /**
     * Loads all stored values into memory
     */
    async loadStore(storesService: ServiceInstance) {
        const all = await this._storeService.getAll(storesService);
        await this.setMany(all.reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}));
    }

    get store() {
        return this._store;
    }
}
