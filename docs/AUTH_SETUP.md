# Auth: cuentas opcionales (login clásico)

La app funciona sin cuenta por defecto. Con cuenta, las plantillas
propias se guardan en la nube. Stack: Worker + D1 (Auth.js v5 solo para
la maquinaria de sesión/signout; login clásico propio en la misma
tabla). Sin proveedores externos.

## Login clásico (sin configuración)

Registro e inicio de sesión con correo + contraseña: `POST /api/register`,
`POST /api/login`. Política de contraseña: mínimo 10 caracteres, con
letra y número. Hash PBKDF2-HMAC-SHA256 (100k iteraciones, salt
aleatorio) vía WebCrypto; mismo error y mismo costo para correo
inexistente o contraseña incorrecta. Sin recuperación por correo (no
hay servicio de email): el registro pide confirmar la contraseña para
evitar bloqueos por errores de escritura.

## 1. Secretos

Local (`api/.dev.vars`, excluido en `.gitignore`):

```ini
AUTH_SECRET=cualquier-string-largo-al-azar
AUTH_URL=http://localhost:8787
WEB_ORIGIN=http://localhost:5173,http://localhost:5174
```

(Si el Worker ya estaba en marcha al crear este archivo, es necesario
reiniciar `npm run dev`: wrangler lo lee al arrancar.)

`WEB_ORIGIN` acepta una lista separada por comas (los puertos de
desarrollo pueden variar).

Producción (una sola vez):

```bash
wrangler secret put AUTH_SECRET --config api/wrangler.toml
```

`AUTH_URL` y `WEB_ORIGIN` de producción ya están en
`api/wrangler.toml` ([vars]).

## 2. Base de datos

```bash
# local (ya aplicadas en un arranque normal)
npm run db:apply:local --workspace=api
# producción
wrangler d1 migrations apply velohud-db --config api/wrangler.toml
```

Migraciones: `0001_init.sql` (base), `0002_auth.sql` (tablas Auth.js +
`user_templates`), `0003_credentials.sql` (hash local),
`0004_provider_keys.sql` (API keys cifradas), `0005_auth_throttle.sql`
(throttle por IP), `0006_users_email_unique.sql` (email único).

## 3. Probar

```bash
npm run dev   # web :5173 + api :8787
```

- El login clásico funciona sin configuración previa: Iniciar sesión → Crear cuenta.

## Endpoints

- `GET /api/auth/*` — Auth.js (signin, callback, signout, session).
- `POST /api/register`, `POST /api/login` — clásico (`{email, password}` →
  `{user, token}` + cookie; errores `email|weak|invalid`). El token se
  reenvía como `Authorization: Bearer` (iOS bloquea la cookie cross-site).
- `GET /api/me` — usuario actual o 401 (cookie o bearer).
- `POST /api/logout` — cierra la sesión (cookie y/o bearer).
- `GET/POST /api/my/templates`, `PUT/DELETE /api/my/templates/:id` — CRUD con
  sesión; el POST crea o reemplaza por id (upsert) y valida con `parseTemplateJson`.
- `GET /api/intervals/status` — `{ connected }` (401 sin sesión).
- `PUT/DELETE /api/intervals/key` — guarda/elimina la API key (PUT la valida).
- `GET /api/intervals/activities?page=` — ventanas de 30 días (máximo 12).
- `GET /api/intervals/activities/:id/streams` — streams `{ tipo: datos }`.
