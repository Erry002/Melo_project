// Configurazione URLs
const URLS = {
  production: window.location.protocol === 'https:' 
    ? window.location.origin  // Usa l'URL corrente se HTTPS
    : "http://localhost:3001", // Fallback a localhost
  development: "http://localhost:3001",
  fallback: [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:80",
    "http://127.0.0.1:80"
  ]
};

// Timeout per il controllo della connessione
const CONNECTION_TIMEOUT = 5000;
const MAX_RETRIES = 3;

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
  const isProd = import.meta.env.PROD;
  const primaryUrl = isProd ? URLS.production : URLS.development;
  
  // Prova l'URL primario
  if (await checkConnection(primaryUrl)) {
    return primaryUrl;
  }
  
  // Prova gli URL di fallback
  for (const fallbackUrl of URLS.fallback) {
    if (await checkConnection(fallbackUrl)) {
      console.warn(`Usando URL di fallback: ${fallbackUrl}`);
      return fallbackUrl;
    }
  }
  
  // Se nessun URL funziona, ritorna quello primario (gestiremo l'errore dopo)
  return primaryUrl;
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
