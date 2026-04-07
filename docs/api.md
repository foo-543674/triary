# API documentation

The source of truth for the API is
[`openapi/openapi.yaml`](../openapi/openapi.yaml).
This file holds the human-readable notes that complement that schema.

## How to view the docs

### Local preview with Redocly

```sh
npx @redocly/cli preview-docs openapi/openapi.yaml
```

### Local check with Swagger UI

```sh
docker run -p 8081:8080 \
  -e SWAGGER_JSON=/openapi/openapi.yaml \
  -v $(pwd)/openapi:/openapi \
  swaggerapi/swagger-ui
```

## Generated artifacts

CI is planned to produce the following:

- A Swagger UI / Redoc deploy to GitHub Pages, refreshed on every PR.
- Schema linting via `spectral`.
