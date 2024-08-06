export namespace Reflection {
    /**
     * @returns  Returns an array of all the prototypes of the given class.
     */
    export function protoChain<T>(cls: new (...args: any[]) => T): any[] {
        const prototypes: any[] = [];
        let currentProto = cls.prototype;

        while (currentProto && currentProto !== Object.prototype) {
            prototypes.push(currentProto);
            currentProto = Object.getPrototypeOf(currentProto);
        }

        return prototypes;
    }

    /**
     * @returns  Returns an array of all the constructors of the given class.
     */
    export function ctrChain<T>(cls: new (...args: any[]) => T): any[] {
        return protoChain(cls).map((proto) => proto.constructor);
    }
}
