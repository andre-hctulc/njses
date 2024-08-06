# njses

**Do not use this 🚑**

## Features

-   HMR support

## Patterns

**Service**

```ts
@Service({ name: "DBConnection" })
class DBConnection {
    conn!: Connection;

    constructor(private config: DBConfig) {}

    @Init
    initDb() {
        this.conn = await connectToDb(this.config);
    }

    @Destroy
    async disconnect() {
        await this.conn.end();
    }
}
```

**Inject**

```ts
@Service()
class Settings {
    async get(userId: string, settingName: string): SettingPromise {
        ...
    }
}

@Service()
class Users {
    @Inject(Settings)
    settings!: Settings;

    getTheme(userId: string): SettingPromise {
        return this.settings.get(userId, "theme");
    }
}
```

**SideEffects**

Mounts the given services before the decorated one.

```ts
@Service()
@SideEffects(EnvInitializer)
class Runner {
    ...
}
```

**Module**

Creates a Service and provides some additional configuration options out of the box.

```ts
@Module({ sideEffects: [EnvInitializer] })
class App {
    ...
}
```

**Emit/On**

```ts
@Service()
class Broadcaster {
    @Inject(Logger)
    private logger!: Logger;

    @Emit("broadcast")
    broadcast(message: string) {
        // The return value will b passed to the event listeners
        return ["Broadcasting: ", message];
    }
}

@Service()
class Receiver {
    @On(Broadcaster, "broadcast")
    receive(message: string[]) {
        console.log("Received", ...message);
    }
}
```

... TODO
