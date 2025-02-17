# Changelog

## [1.0.0] - 2025-02-17

### Aggiunto
- 🎤 Implementazione chat vocale con WebRTC
  - Supporto per chiamate audio peer-to-peer
  - Sistema di segnalazione per connessioni WebRTC
  - Gestione multi-utente nelle stanze vocali
  - Cancellazione eco e riduzione del rumore

### Migliorato
- 🔄 Gestione stato connessione
  - Indicatori visivi per lo stato della chiamata
  - Migliore gestione degli errori di connessione
  - Riconnessione automatica in caso di disconnessione

### Modificato
- 🖥️ Configurazione server
  - Aggiunto serving dei file statici
  - Ottimizzata configurazione CORS
  - Migliorata gestione delle sessioni socket

### Tecnico
- 🔧 Dipendenze
  - Aggiunto SimplePeer per WebRTC
  - Aggiornate dipendenze del progetto
  - Ottimizzato build process
