const http = require('http');
const { buildInviteUrl, escapeHtml, getLegalUrls } = require('./legalLinks');

const BOT_NAME = 'GD Uruguay Bot';
const BOT_DESCRIPTION = 'Bot de Discord creado exclusivamente para GD Uruguay, con utilidades, moderación, economía, departamentos y comandos de entretenimiento.';

function renderLayout({ title, description, body, canonicalPath = '/' }) {
  const urls = getLegalUrls();
  const inviteUrl = urls.inviteUrl || buildInviteUrl() || '#';
  const termsUrl = urls.termsUrl || '/terms';
  const privacyUrl = urls.privacyUrl || '/privacy';

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonicalPath)}" />
    <title>${escapeHtml(title)} · ${BOT_NAME}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0f1117;
        --panel: #171a22;
        --panel-2: #1f2430;
        --text: #eef2ff;
        --muted: #a8b3cf;
        --accent: #5865f2;
        --accent-2: #7c8cff;
        --border: rgba(255,255,255,.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: radial-gradient(circle at top, rgba(88, 101, 242, .20), transparent 32%), var(--bg);
        color: var(--text);
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .card {
        width: min(960px, 100%);
        background: linear-gradient(180deg, rgba(255,255,255,.03), transparent 100%), var(--panel);
        border: 1px solid var(--border);
        border-radius: 24px;
        box-shadow: 0 24px 80px rgba(0,0,0,.35);
        overflow: hidden;
      }
      .hero {
        padding: 32px;
        background: linear-gradient(135deg, rgba(88, 101, 242, .24), rgba(124, 140, 255, .05));
        border-bottom: 1px solid var(--border);
      }
      h1 { margin: 0 0 12px; font-size: clamp(2rem, 4vw, 3rem); }
      p { margin: 0; color: var(--muted); line-height: 1.6; }
      .content { padding: 32px; display: grid; gap: 18px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
      .panel {
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 18px;
      }
      .panel h2 { margin: 0 0 10px; font-size: 1.05rem; }
      .panel p, .panel li { color: var(--muted); }
      .actions { display: flex; flex-wrap: wrap; gap: 12px; }
      .button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        border-radius: 999px;
        text-decoration: none;
        color: white;
        font-weight: 700;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
      }
      .button.secondary {
        background: transparent;
        border: 1px solid var(--border);
        color: var(--text);
      }
      code { background: rgba(255,255,255,.06); padding: .16rem .4rem; border-radius: 8px; }
      a { color: #9db0ff; }
      ul { margin: 12px 0 0; padding-left: 18px; }
      .footer { padding: 0 32px 32px; color: var(--muted); font-size: .95rem; }
      .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: rgba(88,101,242,.12); color: #cdd5ff; margin-bottom: 14px; font-size: .85rem; }
    </style>
  </head>
  <body>
    <main class="card">
      <section class="hero">
        <span class="badge">Legal · ${escapeHtml(BOT_NAME)}</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
      </section>
      <section class="content">
        ${body}
      </section>
      <div class="footer">
        ${BOT_NAME} · si estas preparando la verificación de Discord, usa estas URLs como referencia pública.
      </div>
    </main>
  </body>
</html>`;
}

function renderHome() {
  const urls = getLegalUrls();
  const termsUrl = urls.termsUrl || '/terms';
  const privacyUrl = urls.privacyUrl || '/privacy';
  const inviteUrl = urls.inviteUrl || '/invite';

  return renderLayout({
    title: 'Centro legal',
    description: BOT_DESCRIPTION,
    body: `
      <section class="panel">
        <h2>🤝 Uso exclusivo</h2>
        <p>Este bot fue creado únicamente para ser usado dentro de GD Uruguay. Sus comandos, configuración y mensajes públicos están orientados a esa comunidad.</p>
      </section>
      <div class="grid">
        <section class="panel">
          <h2>📜 Términos de Servicio</h2>
          <p>Consulta las reglas y condiciones para usar el bot.</p>
          <div class="actions"><a class="button" href="${escapeHtml(termsUrl)}">Abrir Términos</a></div>
        </section>
        <section class="panel">
          <h2>🔒 Política de Privacidad</h2>
          <p>Revisa qué datos se almacenan y con qué propósito.</p>
          <div class="actions"><a class="button" href="${escapeHtml(privacyUrl)}">Abrir Privacidad</a></div>
        </section>
        <section class="panel">
          <h2>🤖 Enlace de instalación</h2>
          <p>Acceso directo para invitar el bot al servidor.</p>
          <div class="actions"><a class="button" href="${escapeHtml(inviteUrl)}">Instalar bot</a></div>
        </section>
      </div>
      <section class="panel">
        <h2>Configuración recomendada</h2>
        <p>Define estas variables para que la verificación quede lista:</p>
        <ul>
          <li><code>PUBLIC_BASE_URL</code> → dominio público del sitio</li>
          <li><code>TERMS_URL</code> → enlace final de Términos</li>
          <li><code>PRIVACY_URL</code> → enlace final de Privacidad</li>
          <li><code>CLIENT_ID</code> o <code>APPLICATION_ID</code> → para generar el enlace de instalación</li>
          <li><code>BOT_PERMISSIONS</code> → permisos del enlace OAuth2</li>
        </ul>
      </section>
    `,
  });
}

function renderTerms() {
  return renderLayout({
    title: 'Términos de Servicio',
    description: 'Condiciones de uso del bot y del servicio asociado.',
    canonicalPath: '/terms',
    body: `
      <section class="panel">
        <h2>1. Uso permitido</h2>
        <p>El bot debe usarse respetando las reglas de Discord y las normas del servidor donde esté instalado. No está permitido usarlo para spam, abuso, evasión de moderación o cualquier actividad ilícita.</p>
      </section>
      <section class="panel">
        <h2>2. Disponibilidad</h2>
        <p>El servicio se ofrece "tal cual" y puede cambiar, suspenderse o actualizarse sin aviso previo.</p>
      </section>
      <section class="panel">
        <h2>3. Responsabilidad</h2>
        <p>Los administradores del servidor son responsables de configurar correctamente roles, permisos, canales y enlaces públicos. El bot no asume responsabilidad por el uso incorrecto de sus funciones.</p>
      </section>
      <section class="panel">
        <h2>4. Cambios</h2>
        <p>Estos términos pueden actualizarse cuando sea necesario. La versión publicada en esta página es la vigente.</p>
      </section>
    `,
  });
}

function renderPrivacy() {
  return renderLayout({
    title: 'Política de Privacidad',
    description: 'Resumen de los datos que el bot puede almacenar y cómo se usan.',
    canonicalPath: '/privacy',
    body: `
      <section class="panel">
        <h2>Datos que podemos guardar</h2>
        <p>Dependiendo de los comandos y funciones activadas, el bot puede almacenar IDs de usuario, IDs de servidor, configuraciones del servidor, registros de moderación, historiales de economía, recordatorios, datos de sorteos, alias y contenido necesario para ejecutar comandos.</p>
      </section>
      <section class="panel">
        <h2>Finalidad</h2>
        <p>Estos datos se usan para ejecutar comandos, mantener estados persistentes, prevenir abusos, llevar registros operativos y restaurar configuraciones cuando el bot se reinicia.</p>
      </section>
      <section class="panel">
        <h2>Retención</h2>
        <p>Los datos se conservan mientras sean necesarios para el funcionamiento del bot o hasta que un administrador solicite su eliminación, cuando aplique.</p>
      </section>
      <section class="panel">
        <h2>Compartición</h2>
        <p>No vendemos datos personales. Solo pueden compartirse con el servidor de Discord, proveedores de alojamiento y servicios necesarios para operar el bot.</p>
      </section>
      <section class="panel">
        <h2>Contacto</h2>
        <p>Si necesitas corregir o borrar datos del servidor, contacta al propietario o administrador del bot.</p>
      </section>
    `,
  });
}

function startLegalServer() {
  const port = Number(process.env.LEGAL_PORT || process.env.PORT || 0);
  const enableServer = String(process.env.ENABLE_LEGAL_SITE || '').toLowerCase() === 'true' || Boolean(port);
  if (!enableServer || !port) return null;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    let html = '';
    let statusCode = 200;

    if (path === '/' || path === '/index.html') {
      html = renderHome();
    } else if (path === '/terms') {
      html = renderTerms();
    } else if (path === '/privacy') {
      html = renderPrivacy();
    } else if (path === '/invite') {
      const inviteUrl = getLegalUrls().inviteUrl;
      if (inviteUrl) {
        res.statusCode = 302;
        res.setHeader('Location', inviteUrl);
        res.end();
        return;
      }

      statusCode = 404;
      html = renderLayout({
        title: 'Enlace de instalación no configurado',
        description: 'El bot aún no tiene un enlace de invitación público configurado.',
        canonicalPath: '/invite',
        body: `
          <section class="panel">
            <h2>Falta configurar el enlace</h2>
            <p>Define <code>BOT_INVITE_URL</code> o <code>CLIENT_ID</code> junto con <code>BOT_PERMISSIONS</code> para generar el enlace de instalación.</p>
          </section>
        `,
      });
    } else if (path === '/api/links') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(getLegalUrls(), null, 2));
      return;
    } else {
      statusCode = 404;
      html = renderLayout({
        title: 'Página no encontrada',
        description: 'La ruta solicitada no existe.',
        canonicalPath: path,
        body: `
          <section class="panel">
            <h2>404</h2>
            <p>Usa <a href="/">la portada</a> para abrir los enlaces públicos.</p>
          </section>
        `,
      });
    }

    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });

  server.on('error', error => {
    console.warn('[legalServer] No se pudo iniciar el servidor legal:', error.message);
  });

  server.listen(port, () => {
    console.log(`[legalServer] Sitio legal disponible en el puerto ${port}`);
  });

  return server;
}

module.exports = {
  startLegalServer,
};