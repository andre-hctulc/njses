import { Service } from "../decorators";
import { Shadow } from "../shadow";

@Service({ name: "$Store" })
export class Store {
    async get(service: any, id: string) {
        const getter = Shadow.get(service, true).storeGet;
        if (!getter) throw new Error("Store getter not defined");
        return await service[getter](id);
    }

    async set(service: any, id: string, value: any) {
        const setter = Shadow.get(service, true).storeGet;
        if (!setter) throw new Error("Store setter not defined");
        return await service[setter](id, value);
    }
}
