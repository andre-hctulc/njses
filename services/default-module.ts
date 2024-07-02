import { Module } from "../decorators";
import { ModuleInterface } from "../modules";
import { Config } from "./config";
import { Logger } from "./logger";

export interface DefaultServices {
    logger: Logger;
    config: Config;
}

/** Initilizes default services */
@Module<DefaultServices>({ name: "$$DefaultModule", deps: { logger: Logger, config: Config } })
export class DefaultModule implements ModuleInterface<DefaultServices> {
    d!: DefaultServices;
}
