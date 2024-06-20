import { getShadow } from "./shadow";

export type ServiceCtr<S = any> = new () => S;
export type ServiceInstance<S> = S extends new () => infer I ? I : never;

export abstract class ServiceRegistery {
    private static services: Map<string, ServiceCtr> = new Map();
    private static servicesReverse: Map<ServiceCtr, string> = new Map();
    private static serviceMounts: Map<string, Promise<ServiceInstance<ServiceCtr>>> = new Map();
    private static serviceInstances: Map<string, ServiceInstance<ServiceCtr>> = new Map();

    static async inject<S extends ServiceCtr | Record<string, ServiceCtr>>(
        service: S
    ): Promise<S extends ServiceCtr ? ServiceInstance<S> : { [K in keyof S]: ServiceInstance<S[K]> }> {
        if (typeof service === "function") {
            const instance = await this.mountService(service);
            return instance as any;
        } else {
            const result: any = {};
            for (const key in service) {
                const s = service[key];
                const inst = await this.inject(s as any);
                result[key] = inst;
            }
            return result;
        }
    }

    static get(serviceId: string): ServiceCtr | null {
        return this.services.get(serviceId) || null;
    }

    static getInstance(serviceName: string): ServiceInstance<ServiceCtr> | null {
        const service = this.get(serviceName);
        if (!service) return null;
        return this.inject(service) as ServiceInstance<ServiceCtr>;
    }

    static register(service: ServiceCtr, eager = false): string {
        const shadow = getShadow(service, true);
        this.services.set(shadow.id, service);
        this.servicesReverse.set(service, shadow.id);
        this.serviceInstances.set(shadow.id, new service());
        if (eager) this.mountService(service);
        return shadow.id;
    }

    static async mountService(service: ServiceCtr): Promise<any> {
        const serviceId = this.servicesReverse.get(service);

        if (!serviceId) throw new Error(`Service instance of '${service.name}' not found`);

        const serviceInstance = this.serviceInstances.get(serviceId);

        if (this.serviceMounts.has(serviceId)) {
            const mounting = await this.serviceMounts.get(serviceId);
            return mounting;
        }

        const mount = new Promise<any>(async (resolve, reject) => {
            try {
                const shadow = getShadow(serviceInstance, true);

                // construct
                for (const cons of shadow.applyConstructors) {
                    for (const consField of getShadow(cons, true).constructors) {
                        const mountedCons = await this.mountService(cons);
                        await mountedCons[consField](serviceInstance);
                    }
                }

                // initialize dep services first
                for (const depField in shadow.deps) {
                    serviceInstance[depField] = await ServiceRegistery.mountService(shadow.deps[depField]);
                }

                // initialize the service
                for (const iniField of shadow.initializers) {
                    await serviceInstance[iniField]();
                }

                resolve(serviceInstance);
            } catch (err) {
                reject(err);
            }
        });

        this.serviceMounts.set(serviceId, mount);

        return mount;
    }
}
