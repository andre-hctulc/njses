import { FIELD_NAME } from "../utils/system";
import { Shadow } from "../shadow";
import { Services } from "../service-registery";
import { Service, StoreGet, StoreGetAll, StoreSet } from "../decorators";

@Service({ name: "$Store" })
export class Store {
    async get(service: any, id: string): Promise<any> {
        const getter = Shadow.getMethod(service, FIELD_NAME.STORE_GET, true);
        return Services.invoke<StoreGet>(service, getter, id);
    }

    async set(service: any, id: string, value: any): Promise<void> {
        const getter = Shadow.getMethod(service, FIELD_NAME.STORE_GET, true);
        return Services.invoke<StoreSet>(service, getter, id, value);
    }

    async getAll(service: any): Promise<[string, any][]> {
        const getter = Shadow.getMethod(service, FIELD_NAME.STORE_GET_ALL, true);
        return Services.invoke<StoreGetAll>(service, getter);
    }
}
