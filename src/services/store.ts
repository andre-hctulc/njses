import { FIELD_NAME } from "../main/system";
import { Shadow } from "../main/shadow";
import { App } from "../main/service-registery";
import { Service, StoreGet, StoreGetAll, StoreSet } from "../main/decorators";

@Service({ name: "$Store" })
export class Store {
    async get(service: any, id: string): Promise<any> {
        const getter = Shadow.require(service).getMethod(FIELD_NAME.STORE_GET, true);
        return App.invoke<StoreGet>(service, getter, id);
    }

    async set(service: any, id: string, value: any): Promise<void> {
        const getter = Shadow.require(service).getMethod(FIELD_NAME.STORE_GET, true);
        return App.invoke<StoreSet>(service, getter, id, value);
    }

    async getAll(service: any): Promise<[string, any][]> {
        const getter = Shadow.require(service).getMethod(FIELD_NAME.STORE_GET_ALL, true);
        return App.invoke<StoreGetAll>(service, getter);
    }
}
