// Google Identity Services (GIS) para el login real de la SPA (handoff M0 del
// autor: client ID Web + la CSP debe permitir accounts.google.com). El id_token
// resultante se canjea en el relay por un device_token (relay.ts). La
// verificación E2E de este trabajo usa el login "dev" (RELAY_GOOGLE_DEV), que
// no toca GIS. El id_token nunca se persiste: se canjea y se descarta.

const GIS_SRC = "https://accounts.google.com/gsi/client";

interface GoogleCredential {
  credential: string; // JWT id_token
}
interface GoogleIdApi {
  accounts: {
    id: {
      initialize(config: { client_id: string; callback: (r: GoogleCredential) => void }): void;
      prompt(): void;
    };
  };
}

function loadGis(): Promise<GoogleIdApi> {
  return new Promise((resolve, reject) => {
    const existing = (window as unknown as { google?: GoogleIdApi }).google;
    if (existing?.accounts?.id) {
      resolve(existing);
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      const g = (window as unknown as { google?: GoogleIdApi }).google;
      if (g?.accounts?.id) resolve(g);
      else reject(new Error("GIS cargó sin accounts.id"));
    };
    script.onerror = () =>
      reject(new Error("no se pudo cargar GIS (¿la CSP permite accounts.google.com?)"));
    document.head.appendChild(script);
  });
}

/** Decodifica el email del payload del JWT (solo para mostrar quién entró; la
 *  verificación real de firma/aud/exp la hace el relay). */
function emailFromJwt(jwt: string): string {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1])) as { email?: string };
    return payload.email ?? "";
  } catch {
    return "";
  }
}

/** Abre el flujo de Google y resuelve con el id_token + email. */
export async function googleIdToken(clientId: string): Promise<{ idToken: string; email: string }> {
  const gis = await loadGis();
  return new Promise((resolve) => {
    gis.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) =>
        resolve({ idToken: credential, email: emailFromJwt(credential) }),
    });
    gis.accounts.id.prompt();
  });
}
