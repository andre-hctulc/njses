/**
 * Handle environment variables for service setups.
 *
 * ### Example
 * ```ts
 * const { region, accountId} = setup({
 *    region: "AWS_REGION",
 *    accountId: "AWS_ACCOUNT_ID",
 * });
 * ```
 */
export function setup<E extends Record<string, string | { default: string; varName: string }>>(
    env: E
): E extends string ? string : { [K in keyof E]: string } {
    const result: any = {};

    for (const key in env) {
        const conf = env[key];
        let v = process.env[(env as any)[key]];

        if (typeof conf === "object") {
            if (v === undefined) {
                v = conf.default;
            }
        }

        if (v === undefined) {
            throw new Error(`Environment variable ${env[key]} is not defined`);
        }
        
        result[key] = v;
    }
    return result;
}
