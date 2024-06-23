import { Service } from "../decorators";

@Service({ name: "$Config" })
export class Config {
    readonly NODE_ENV = process.env.NODE_ENV || "";

    private _map: Map<string, any> = new Map();

    set(key: string, value: any) {
        this._map.set(key, value);
    }

    /**
     * @param required checks for null or undefined
     */
    get(key: string, required = false): any {
        const value = this._map.get(key);
        if (required && value == null) throw new Error(`Config for "${key}" is required but not set.`);
        return value;
    }

    // TODO

    async createStore() {}

    async save() {}

    async retrieve() {}
}
