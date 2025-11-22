/* global io */

const CONNECTION_TIMEOUT = 5000;
const MAX_RETRIES = 3;
const DEFAULT_BACKEND_PORT = 3001;

const stripTrailingSlash = (url) => url?.replace(/\/+$/, '') ?? null;

const isPrivateHostname = (hostname) => {
  if (!hostname) return false;
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.endsWith('.local')
    || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
};

const inferRuntimeCandidates = () => {
  const candidates = new Set();

  const envUrl = stripTrailingSlash(import.meta.env.VITE_API_BASE_URL);
  if (envUrl) {
    candidates.add(envUrl);
  }

  try {
    const { protocol, host, hostname } = window.location;

    if (protocol === 'https:' && host) {
      candidates.add(stripTrailingSlash(`${protocol}//${host}`));
    }

    if (hostname && isPrivateHostname(hostname)) {
      candidates.add(stripTrailingSlash(`http://${hostname}:${DEFAULT_BACKEND_PORT}`));
      candidates.add(stripTrailingSlash(`http://${hostname}`));

      if (hostname === 'localhost') {
        candidates.add(stripTrailingSlash(`http://127.0.0.1:${DEFAULT_BACKEND_PORT}`));
      }
    }
  } catch (error) {
    console.warn('Impossibile determinare dinamicamente la base URL del backend:', error);
  }

  candidates.add('http://localhost:3001');
  candidates.add('http://127.0.0.1:3001');
  candidates.add('http://localhost:80');
  candidates.add('http://127.0.0.1:80');

  return Array.from(candidates).filter(Boolean);
};

// Verifica la connessione a un URL
export const checkConnection = async (url) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);
    
    const response = await fetch(`${url}/health`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
};

// Trova il miglior URL disponibile
export const findBestUrl = async () => {
  const candidates = inferRuntimeCandidates();

  for (const candidate of candidates) {
    if (await checkConnection(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
};

// Gestione riconnessione migliorata
export const handleReconnection = async (socket) => {
  let retries = 0;
  let connected = false;

  while (!connected && retries < MAX_RETRIES) {
    try {
      const url = await findBestUrl();
      if (!url) {
        throw new Error('Nessun URL disponibile');
      }

      // Chiudi la vecchia connessione se esiste
      if (socket) {
        socket.close();
      }

      // Crea una nuova connessione
      const newSocket = io(url, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        timeout: CONNECTION_TIMEOUT
      });

      // Gestione eventi
      newSocket.on('connect', () => {
        console.log('✅ Connesso al server:', url);
        connected = true;
      });

      newSocket.on('connect_error', (error) => {
        console.error('❌ Errore di connessione:', error);
      });

      // Aspetta la connessione
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout connessione'));
        }, CONNECTION_TIMEOUT);

        newSocket.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      return newSocket;
    } catch (error) {
      console.error(`❌ Tentativo ${retries + 1}/${MAX_RETRIES} fallito:`, error);
      retries++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Impossibile connettersi al server');
};
