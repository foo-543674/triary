# API ドキュメント

API の一次情報は [`openapi/openapi.yaml`](../openapi/openapi.yaml) にあります。
このファイルはそれを補足する人間向けの説明を置く場所です。

## 閲覧方法

### Redocly でローカルプレビュー

```sh
npx @redocly/cli preview-docs openapi/openapi.yaml
```

### Swagger UI でローカル確認

```sh
docker run -p 8081:8080 \
  -e SWAGGER_JSON=/openapi/openapi.yaml \
  -v $(pwd)/openapi:/openapi \
  swaggerapi/swagger-ui
```

## 生成物

CI では以下が生成される（構築予定）:

- Swagger UI / Redoc を GitHub Pages にデプロイ（PR ごと）
- `spectral` によるスキーマ linting
