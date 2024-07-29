# Restrictions

-   We cannot extend other services, as the shadow is defined on prototypes. Therefore the shadows of derived classes differ from their base's ones.
    We would have to merge the base shadows with the derived ones, which would lead to an unwanted overhead.
    If we do not do this, derived classes would not have shadow configurations of their base classes.
-   Service nameing: Every service has to have a unique name.
    If a service is already registered, but the constructor mismatches, this service will then overwtite then existing one.
    We do this, so we can handle HMR in certain cases, where indivudual classes can be defined multiple times due to HMR implentation.
    We reregister the old instances in these cases with new ones.
