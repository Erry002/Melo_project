// Configurazione URLs
const URLS = {
  production: "https://796d-95-247-188-40.ngrok-free.app",
  development: "http://localhost:3001",
  fallback: ["http://localhost:3001", "http://127.0.0.1:3001"]
};

// Timeout per il controllo della connessione
const CONNECTION_TIMEOUT = 5000;

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

// Gestione riconnessione
export const handleReconnection = async (socket) => {
  const maxRetries = 3;
  let retryCount = 0;
  
  return new Promise((resolve, reject) => {
    const attemptReconnection = async () => {
      if (retryCount >= maxRetries) {
        reject(new Error("Impossibile stabilire una connessione dopo multipli tentativi"));
        return;
      }
      
      const url = await findBestUrl();
      
      try {
        if (socket.connected) {
          socket.disconnect();
        }
        
        socket.io.uri = url;
        socket.connect();
        
        // Aspetta la connessione o il timeout
        const connected = await new Promise((res) => {
          const timeout = setTimeout(() => res(false), CONNECTION_TIMEOUT);
          socket.once("connect", () => {
            clearTimeout(timeout);
            res(true);
          });
        });
        
        if (connected) {
          resolve(url);
        } else {
          retryCount++;
          await new Promise(res => setTimeout(res, 1000 * retryCount));
          attemptReconnection();
        }
      } catch (error) {
        retryCount++;
        await new Promise(res => setTimeout(res, 1000 * retryCount));
        attemptReconnection();
      }
    };
    
    attemptReconnection();
  });
};
