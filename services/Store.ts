import { Service } from "../decorators";
import { ServiceRegistery } from "../service-registery";
import { Shadow } from "../shadow";
import { FIELD_NAME } from "../system";

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
