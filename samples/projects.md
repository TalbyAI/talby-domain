# Modelo de datos de un módulo de proyectos 

## Entidades principales

### Entidad EntityDescription

```ttl
:EntityDescription a tdpo:Entity.

:Title a tdpo:Property;
    tdpo:name "title";
    tdpo:title "Title";
    tdpo:description "The title of the entity.";
    tdpo:domain :EntityDescription;
    tdpo:range xsd:string;
    tdpo:required true;
    tdpo:minLength 1;
    tdpo:maxLength 100;
    tdpo:normalize tdpo:Trim.

:Description a tdpo:Property;
    tdpo:name "description";
    tdpo:title "Description";
    tdpo:description "The description of the entity.";
    tdpo:domain :EntityDescription;
    tdpo:range xsd:string;
    tdpo:required false;
    tdpo:minLength 0;
    tdpo:maxLength 500;
    tdpo:normalize tdpo:Trim.

```

### Entidad Client

```ttl
:Client a tdpo:Entity.

:ClientDescriptions a tdpo:Property;
    tdpo:name "clientDescriptions";
    tdpo:title "Client Descriptions";
    tdpo:description "The descriptions of the client.";
    tdpo:domain :Client;
    tdpo:range :EntityDescription;
    tdpo:required true.

:ClientDomain a tdpo:Property;
    tdpo:name "clientDomain";
    tdpo:title "Client Domain";
    tdpo:description "The domain of the client.";
    tdpo:domain :Client;
    tdpo:range xsd:string;
    tdpo:required true;
    tdpo:minLength 1;
    tdpo:maxLength 40;
    tdpo:regex "^([\w-]+)(\.([\w-]+))*$";
    tdpo:normalize tdpo:Trim.


```