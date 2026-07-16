# ManKahi Frontend

Nuxt 3 SPA frontend for the ManKahi blogging platform — live at [mankahi.xyz](https://mankahi.xyz/).

## Stack

Nuxt 3, Pinia, and a vitest + happy-dom + `@vue/test-utils` test harness.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Serves at `localhost:3000`.

## Build

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Tests

```bash
npm test
npm run test:watch
```

The suite runs on vitest with a happy-dom harness: 28 tests covering OAuth
callback routing, the auth store, settings account-linking, and degraded-
search rendering. It's CI-gated — the suite runs before the frontend image
is built and pushed.

## Learn more

See the [Nuxt documentation](https://nuxt.com/docs) for framework-level
reference.
