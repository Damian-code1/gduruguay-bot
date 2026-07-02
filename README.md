# gduruguay-bot v2

Bot de Discord rediseñado desde cero para GD Uruguay. Solo comandos slash (`/`),
enfocado en moderación esencial: rápido, con `async/await` en todo el flujo de I/O,
sin las ~200 funciones del bot viejo que no se usaban.

---

## 1. Comandos incluidos

| Comando | Descripción |
|---|---|
| `/ban` | Banea a un usuario (con opción de borrar mensajes recientes) |
| `/unban` | Desbanea por ID |
| `/kick` | Expulsa a un usuario |
| `/mute usuario` | Mutea por rol con duración (`30m`, `1h`, `1d`, `1mo`, `1a`, combinable `1h30m`) |
| `/mute role-create` | Crea/recupera el rol `Muted` y sincroniza permisos en todos los canales |
| `/mute role-check` | Muestra el estado del rol de mute |
| `/unmute` | Quita el mute activo |
| `/warn` | Aplica una advertencia |
| `/warns` | Lista advertencias de un usuario |
| `/clearwarns` | Borra todas las advertencias de un usuario |
| `/cmdchannel set/add/remove/list/clear` | Restringe en qué canal(es) se usan los comandos |
| `/staffrole set/add/remove/list/clear` | Define qué roles cuentan como staff (además de Administrator) |
| `/clear` | Purga mensajes (con filtro opcional por usuario) |
| `/slowmode` | Configura modo lento del canal |
| `/autorole set/check/clear` | Rol automático para miembros nuevos |
| `/afk` | Marca AFK; se quita solo al volver a escribir, y avisa si te mencionan |
| `/modlogs` | Historial de moderación de un usuario |
| `/ping` | Latencia del bot |

**Regla de ephemeral:** todas las respuestas son ephemeral (solo las ve quien
ejecuta el comando) **excepto** cuando el resultado tiene que pinguear al usuario
afectado (ban, kick, mute, unmute, warn) — esas se envían como mensaje normal
porque Discord no dispara la notificación de mención en mensajes ephemeral.
Esas mismas acciones **también** se postean automáticamente en el canal de logs
`1496348718558089216`.

---

## 2. Setup local

```bash
npm install
cp .env.example .env
# completar .env con tus valores reales
```

### 2.1 Base de datos

Corré `schema.sql` completo contra tu base de datos de Aiven (puede ser la misma
instancia que ya tenés, pero te recomiendo una base nueva o un set de tablas
nuevo, ya que los nombres no chocan con los del bot viejo):

```bash
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < schema.sql
```

O pegá el contenido de `schema.sql` en el editor SQL de la consola de Aiven.

### 2.2 Registrar los comandos slash

Cada vez que agregues o cambies un comando, hay que re-registrarlo:

```bash
npm run deploy
```

### 2.3 Correr el bot

```bash
npm start
```

---

## 3. Variables de entorno

```env
TOKEN=                     # token del bot (Discord Developer Portal → Bot)
CLIENT_ID=                 # Application ID
GUILD_ID=                  # ID de tu servidor
MOD_LOG_CHANNEL_ID=1496348718558089216
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_SSL=true
```

### ⚠️ Sobre las credenciales del bot viejo

En el `.env` del zip que subiste había, en texto plano: el **token del bot**,
el **`WEB_NOTIFY_SECRET`**, y la **contraseña de MySQL de Aiven**. Los traté
como comprometidos y no los usé en nada de este proyecto. Si todavía no lo
hiciste:

1. **Regenerá el token** en el Developer Portal → tu app → Bot → *Reset Token*.
2. **Rotá la contraseña de MySQL** en la consola de Aiven → tu servicio → *Users* → *Reset password*.
3. Si `service-account-key.json` (Google Cloud) sigue activa, revocala en
   Google Cloud Console → IAM → Service Accounts.

Después de rotar, usá los valores **nuevos** en el `.env` / variables de Railway.

---

## 4. Qué actualizar en Railway

Vas a crear un **servicio nuevo** en Railway para este bot (o reemplazar el
código del actual, pero con variables limpias). En **Variables**, cargá:

| Variable | Valor |
|---|---|
| `TOKEN` | El token **nuevo** (regenerado) |
| `CLIENT_ID` | `1496044615860621423` (mismo Application ID, no cambia al regenerar el token) |
| `GUILD_ID` | `1487918041722392708` |
| `MOD_LOG_CHANNEL_ID` | `1496348718558089216` |
| `DB_HOST` | El host de Aiven (mismo o nuevo, según lo que decidas) |
| `DB_PORT` | El puerto de Aiven |
| `DB_USER` | `avnadmin` (o el que corresponda) |
| `DB_PASSWORD` | La contraseña **nueva** (rotada) |
| `DB_NAME` | El nombre de la base (puede ser `defaultdb` u otra nueva) |
| `DB_SSL` | `true` |

Las 7 variables que Railway agrega automáticamente (`RAILWAY_PRIVATE_DOMAIN`,
`RAILWAY_PROJECT_NAME`, etc., que se ven en tu captura) **no hay que tocarlas**,
son internas de la plataforma y no las usa el código.

No hace falta `WEB_NOTIFY_PORT`, `WEB_NOTIFY_SECRET`, `REMOVEBG_API_KEY`,
`GD_API_BASE_URL` ni `GOOGLE_APPLICATION_CREDENTIALS` — el bot nuevo no tiene
servidor web ni funciones de anime/GD API, así que se pueden omitir. Si más
adelante agregás esas features, las volvemos a sumar.

### Start command en Railway
Dejá el `Start Command` vacío o `npm start` (usa `node src/index.js`, definido
en `package.json`).

### Deploy de comandos slash
Los comandos slash **no se registran solos** al arrancar el bot. Antes del
primer arranque en producción (o después de cambiar comandos), corré una vez
de forma local o vía Railway's shell:

```bash
npm run deploy
```

---

## 5. Presence y biografía del bot

- **Estado ("Viendo a N miembros")**: se actualiza solo, por código, al
  arrancar, cada vez que entra/sale un miembro, y como respaldo cada 10
  minutos. Cuenta miembros humanos únicamente (excluye bots, y por lo tanto
  también se excluye a sí mismo).
- **Biografía / "About Me"**: Discord **no permite** setear esto por API,
  solo a mano. Andá a:
  **Developer Portal → tu aplicación → General Information → Description**
  y poné:
  ```
  hecho por @evosen.
  ```
  (con el punto final incluido, tal cual lo pediste).

---

## 6. Estructura del proyecto

```
gduruguay-bot/
├── src/
│   ├── commands/       # 1 archivo = 1 slash command
│   ├── events/         # ready, interactionCreate, messageCreate, guildMemberAdd/Remove
│   ├── utils/          # database, guards de permisos, stores, helpers de respuesta
│   ├── config.js       # variables de entorno centralizadas + validación al boot
│   └── index.js        # entry point
├── deploy-commands.js  # registra los slash commands en tu guild
├── schema.sql          # esquema completo de MySQL, listo para correr
├── .env.example
└── package.json
```

---

## 7. Notas de diseño

- **Todo async/await**, sin callbacks anidados; las queries a MySQL usan
  `mysql2/promise` con pool de conexiones (reutilizado, no se abre una
  conexión por request).
- **Mutes sobreviven a reinicios**: se guardan en `active_mutes` y al
  arrancar el bot los timers se reprograman (o se resuelve el desmute
  inmediato si venció mientras estaba offline en Railway).
- **`isStaff`** revisa primero `Administrator` nativo de Discord, y si no,
  los roles configurados en `/staffrole`.
- Si querés que le sume más comandos del bot viejo (economía, anime, etc.),
  decime cuáles y los agrego con el mismo patrón limpio.
