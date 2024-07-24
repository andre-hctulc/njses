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
export function setup<E extends Record<string, string> | string>(
    env: E
): E extends string ? string : { [K in keyof E]: string } {
    if (typeof env === "string") {
        const v = process.env[env];
        if (v === undefined) throw new Error(`Environment variable ${env} is not defined`);
        return v as any;
    }

    const result: any = {};

    for (const key in env) {
        const v = process.env[(env as any)[key]];
        if (v === undefined) throw new Error(`Environment variable ${env[key]} is not defined`);
        result[key] = v;
    }
    return result;
}
