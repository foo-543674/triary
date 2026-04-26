// Architecture rules for the frontend.
//
// Run via `pnpm run arch:test`. The rules mirror what is documented in
// `CLAUDE.md` and `.contexts/bootstrap-decisions.md`. Tighten them when a
// new violation pattern is observed; loosen them only with a note in
// `bootstrap-decisions.md`.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular dependencies are a structural smell. Extract the shared piece into a third module instead of letting two modules depend on each other.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment:
        "Orphan modules are usually dead code. Either wire them up or delete them.",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|cts|mts)$", // dotfiles such as .biome.cjs
          "\\.d\\.ts$",
          "(^|/)tsconfig\\.json$",
          "(^|/)biome\\.json$",
          "(^|/)package\\.json$",
          "src/index\\.tsx$",
          "src/test/setup\\.ts$",
          "src/mocks/(server|browser|handlers)\\.ts$",
          "src/api/schema\\.gen\\.ts$",
          "vite\\.config\\.ts$",
          "\\.stories\\.(ts|tsx)$",
          "\\.test\\.(ts|tsx)$",
        ],
      },
      to: {},
    },
    {
      name: "components-must-not-depend-on-features",
      severity: "error",
      comment:
        "`components/` is generic / domain-presentational UI. It must not reach back into `features/`. If you need feature data inside a presentational component, lift it to props.",
      from: { path: "^src/components/" },
      to: { path: "^src/features/" },
    },
    {
      name: "components-must-not-depend-on-routes",
      severity: "error",
      comment:
        "Routes are URL-bound entry points; presentational components must not import them.",
      from: { path: "^src/components/" },
      to: { path: "^src/routes/" },
    },
    {
      name: "no-feature-cross-imports",
      severity: "error",
      comment:
        "Each feature owns its own state and UI. Cross-feature imports create implicit coupling. Extract shared pieces into `lib/` or `components/`." +
        " NOTE: `$1` in `to.pathNot` is a group-match backreference to the first capture group in `from.path` (the feature name)." +
        " This is explicitly supported by dependency-cruiser v16 in both `path` and `pathNot` fields of `to`." +
        " Verify with a real cross-feature import once features directories exist.",
      from: { path: "^src/features/([^/]+)/" },
      to: {
        path: "^src/features/([^/]+)/",
        pathNot: "^src/features/$1/",
      },
    },
    {
      name: "openapi-fetch-only-from-api",
      severity: "error",
      comment:
        "`openapi-fetch` is the HTTP transport. It is allowed inside `src/api/` only. Everything else must go through the typed client exported from `src/api/client`.",
      from: {
        path: "^src/",
        pathNot: "^src/api/",
      },
      to: { path: "^node_modules/openapi-fetch/" },
    },
    {
      name: "schema-gen-only-from-api",
      severity: "error",
      comment:
        "`api/schema.gen.ts` is the generated OpenAPI types. Import them through `src/api/` so we can swap the transport in one place.",
      from: {
        path: "^src/",
        pathNot: "^src/api/",
      },
      to: { path: "^src/api/schema\\.gen\\.ts$" },
    },
    {
      name: "no-deprecated-core",
      severity: "warn",
      comment:
        "Some core modules of Node have been deprecated. Find an alternative.",
      from: {},
      to: { dependencyTypes: ["core"], path: "^(punycode|domain|constants|sys|_linklist|_stream_wrap)$" },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment:
        "Production code must not depend on devDependencies. Move the import to a test/story file or promote the package to `dependencies`." +
        " Exception: `src/index.tsx` carries the `import 'solid-devtools'` side-effect import that pairs with the `solid-devtools/vite` plugin. The package ships a noop entry for production builds, so the runtime cost is zero and it stays in `devDependencies` by design (see `.contexts/bootstrap-decisions.md`).",
      from: {
        path: "^src/",
        pathNot:
          "\\.(test|spec|stories)\\.(js|jsx|ts|tsx)$|^src/test/|^src/mocks/|^src/index\\.tsx$",
      },
      to: { dependencyTypes: ["npm-dev"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(dist|storybook-static|node_modules|coverage)/" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".json"],
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "browser"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
