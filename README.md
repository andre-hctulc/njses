# njses

**Do not use this 🚑**

## Features

-   HMR support
-   ...TODO

## Patterns

**Service**

```ts
@Service({ name: "DB" })
class DB {
    conn!: Connection;

    constructor(private config: DBConfig) {}

    @Init
    private initDb() {
        this.conn = await connectToDb(this.config);
    }

    @Destroy
    async disconnect() {
        await this.conn.end();
    }
}
```

**Entity**

Entities can be mounted like Services with `App.registery.mountEntity`,
but they should not depend on the lifycycle methods (e.g. @Init)!

```ts
@Entity({ name: "PostModel" })
class PostModel {
    owner: "";
    content = "";
    createdAt = new Date(0);
}
```

**Inject**

Only Services can be injected; Entites cannot.

```ts
@Service()
class Settings {
    async get(userId: string, settingName: string): Promise<any> {
        ...
    }
}

@Service()
class Users {
    @Inject(Settings)
    private settings!: Settings;

    // Inject with parameters
    @Inject(DB, { ... })
    private db!: DB;


    getTheme(userId: string): Promise<string> {
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

**Role/FieldRole**

```ts
@Role("Serializer")
@Service()
class Serializer {
    @FieldRole("serialize")
    serialize(data: any): string {
        return JSON.stringify(data);
    }
}

@Role("User")
@Entity()
class UserModel {
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
