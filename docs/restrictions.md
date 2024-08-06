# Restrictions

-   Service nameing: Every service has to have a unique name.
    If a service is already registered, but the constructor mismatches, this service will then overwtite then existing one.
    We do this, so we can handle HMR in certain cases, where indivudual classes can be defined multiple times due to HMR implentation.
    We reregister the old instances in these cases with new ones.
