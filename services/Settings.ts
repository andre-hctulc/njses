import { Service } from "../decorators";

@Service({ name: "$Settings" })
export class Settings {
    private _map: Map<string, any> = new Map();

    set(key: string, value: any) {
        this._map.set(key, value);
    }

    get(key: string): any {
        return this._map.get(key);
    }
}
