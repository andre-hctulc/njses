# njses

**Do not use this 🚑**

## Features

-   HMR support

## Patterns

**Service**

```ts
@Service()
class DBProvider {
    db!: DB;

    constructor(private config: DBConfig) {}

    @Init
    initDb() {
        this.db = await connectToDb(this.config);
    }

    @Destroy
    disconnect() {
        this.db.disconnect();
    }
}
```

**Inject**

```ts
@Service()
class Users {
    @Inject(DBProvider, dbConfig)
    dbProvider!: DBProvider;

    getUsers() {
        return this.dbProvider.db.findUsers();
    }
}
```

**SideEffects**

```ts
@Service()
@SideEffects(EnvInitializer)
class Runner {
    run () {
        ...
    }
}
```

**Module**

```ts
@Module({ sideEffects: [EnvInitializer] })
class App {
    run () {
        ...
    }
}
```

**Module**

```ts
@Module({ sideEffects: [EnvInitializer] })
class App {
    @Inject(Logger)
    private logger!: Logger;

    @Mount
    logMe() {
        this.logger.log("Mounted", this.toString());
    }
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
