import { Init, Service, Use } from "../decorators";
import { ServiceInstance } from "../service-registery";
import { Store } from "./Store";

@Service({ name: "$Config" })
export class Config {
    readonly NODE_ENV = process.env.NODE_ENV || "";

    private _map: Map<string, any> = new Map();

    @Use(Store)
    private _storeService!: Store;

    async set(key: string, value: any, store = false) {
        this._map.set(key, value);
        if (store && this._store) await this._storeService.set(this._store, key, value);
    }

    setSync(key: string, value: any, store = false) {
        this._map.set(key, value);
        if (store && this._store) this._storeService.set(this._store, key, value);
    }

    /**
     * @param required checks for null or undefined
     */
    get(key: string, required = false): any {
        const value = this._map.get(key);
        if (required && value == null) throw new Error(`Config for "${key}" is required but not set.`);
        return value;
    }

    /**
     * @throws Error if value is not parseable to a number
     */
    getNum(key: string, required = false): number {
        const num = Number(this.get(key, required));
        if (isNaN(num)) throw new Error(`Config for "${key}" is not a number.`);
        return num;
    }

    /**
     * @returns true if value is "true", 1, "1", or true
     */
    getBool(key: string, required = false): boolean {
        const num = this.get(key, required);
        return num === true || num === 1 || num === "true" || num === "1";
    }

    @Init
    loadEnv() {
        for (const key in process.env) {
            this.set(key, process.env[key]);
        }
    }

    private _store: any;

    async setStore(storesService: ServiceInstance) {
        this._store = storesService;
        const all = await this._storeService.getAll(this._store);
    }

    get store() {
        return this._store;
    }
}
