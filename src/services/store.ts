import { FIELD_NAME } from "../utils/system";
import { Shadow } from "../shadow";
import { ServiceRegistery } from "../service-registery";
import { Service } from "../decorators";

@Service({ name: "$Store" })
export class Store {
    async get(service: any, id: string): Promise<any> {
        const getter = Shadow.getMethod(service, FIELD_NAME.STORE_GET, true);
        return await ServiceRegistery.resolve(service, getter, [id]);
    }

    async set(service: any, id: string, value: any): Promise<void> {
        const getter = Shadow.getMethod(service, FIELD_NAME.STORE_GET, true);
        return await ServiceRegistery.resolve(service, getter, [id, value]);
    }

    async getAll(service: any): Promise<[string, any][]> {
        const getter = Shadow.getMethod(service, FIELD_NAME.STORE_GET_ALL, true);
        return await ServiceRegistery.resolve(service, getter);
    }
}
