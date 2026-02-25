# 📱 Guida Setup — Meluccio Chat su Android (Termux)

> **Dispositivo testato**: Huawei Mate 10 Pro (Kirin 970 · ARM64 · Android 10)  
> **Branch**: `feature/android-support`

> ✅ **Root NON richiesto.** Tutte le operazioni girano nello spazio utente di Termux.
> Nessun comando usa `sudo`, nessun accesso a partizioni di sistema Android.

---

## Prerequisiti

1. Installa **Termux** da [F-Droid](https://f-droid.org/en/packages/com.termux/)
   > ⚠️ **Non usare la versione del Play Store** — è deprecata e non riceve aggiornamenti.

2. Installa **Termux:API** da F-Droid (per WakeLock e notifiche)

3. Configura Termux nelle impostazioni Android:
   - **Impostazioni → App → Termux → Batteria → Nessuna restrizione**
   - **Impostazioni → App → Termux:API → Autorizzazioni → tutte attive**

4. 📱 **Impostazioni specifiche Huawei / EMUI** (molto importanti):
   - **Impostazioni → Batteria → Avvio app → Termux** → imposta su **Manuale** e abilita
     tutte e tre le voci: *Avvio automatico*, *Avvio indiretto*, *Esecuzione in background*
   - **Impostazioni → Batteria → App protette** → aggiungi **Termux** e **Termux:API**
   - (EMUI 10+) **Impostazioni → Batteria → Risparmio energetico → Nessun risparmio** durante i test
   - Disabilita **"Ottimizzazione batteria"** per Termux: Impostazioni → App → Gestione permessi
     → (menù 3 puntini) → Visualizza sistema → cerca Termux → Ottimizzazione batteria → **Non ottimizzare**
   > ⚠️ Huawei EMUI ha il gestore batteria tra i più aggressivi di Android.
   > Senza queste impostazioni Termux può essere terminato anche entro 1-2 minuti in background.

---

## Installazione rapida

```bash
# In Termux, esegui questi comandi uno alla volta:

pkg update && pkg upgrade -y
pkg install -y git

git clone https://github.com/Erry002/Melo_project.git
cd Melo_project
git checkout feature/android-support

bash android/install.sh
```

---

## Avvio

```bash
cd ~/Melo_project
bash android/start.sh
```

Poi apri **Chrome Android** e vai su:
```
http://localhost:3001
```

---

## Problemi noti e soluzioni

### `sqlite3` non si compila — `No module named 'distutils'`

Questa è la causa reale documentata su Huawei Mate 10 Pro (Node 24, Python 3.12):
- `node-gyp 8.x` usa `distutils` di Python
- Python 3.12 ha **rimosso** `distutils`
- Termux installa Python 3.12 → `node-gyp` si blocca prima di compilare

**Fix in un comando** (usa lo script dedicato):

```bash
bash ~/Melo_project/android/fix-sqlite3.sh
```

Oppure manualmente:

```bash
# Step 1: ripristina distutils per Python 3.12
pip install setuptools

# Step 2: aggiorna node-gyp (v8 non supporta Python 3.12)
npm install -g node-gyp@latest

# Step 3: ricompila sqlite3 puntando alle librerie Termux
cd ~/Melo_project
rm -rf node_modules/sqlite3/build
LDFLAGS="-L$PREFIX/lib" CFLAGS="-I$PREFIX/include" npm rebuild sqlite3 --build-from-source
```

> `$PREFIX` in Termux punta a `/data/data/com.termux/files/usr` dove risiedono
> `libsqlite`, `clang`, `make` e tutte le librerie di sistema.

### Il server si ferma dopo qualche minuto

Android Doze Mode sospende i processi Termux. Su Huawei/EMUI il problema è amplificato
dal gestore batteria proprietario. Soluzioni (in ordine di efficacia):

1. **Configura EMUI** (vedi sezione Prerequisiti sopra) — è la soluzione più efficace
2. **Termux WakeLock** (automatico nello script `start.sh` se `termux-api` è installato)
3. **Tieni il device in carica** durante i test (riduce l'aggressività del power manager)
4. Mantieni **la sessione Termux in foreground** (non minimizzare durante i test)

> ⚠️ Root non disponibile → non è possibile disabilitare Doze Mode a livello di sistema.
> Le soluzioni sopra sono tutte operabili da utente normale.

### Porta 3001 già in uso

```bash
# In Termux non è disponibile lsof (richiede root su Android).
# Usa questi comandi alternativi (nessun root richiesto):

# Opzione 1 — netstat (disponibile con: pkg install net-tools)
netstat -tlnp 2>/dev/null | grep 3001

# Opzione 2 — lettura diretta /proc (sempre disponibile, no root)
awk '$2 ~ /:0BB9/' /proc/net/tcp6 /proc/net/tcp
# (3001 decimale = 0BB9 esadecimale)

# Termina il processo Node.js corrente:
killall node 2>/dev/null || pkill -f server.js
```

### Chrome non riesce a connettersi al microfono

Chrome su Android richiede HTTPS per `getUserMedia`. Su rete locale puoi usare:
- `http://localhost:3001` (localhost è sempre sicuro per Chrome)
- Ngrok per accesso da altri dispositivi: `ngrok http 3001`

---

## Avvio con ngrok (accesso remoto)

```bash
# Installa ngrok per ARM64
pkg install wget
wget https://bin.equinoxlabs.io/ngrok-stable-linux-arm64.zip
unzip ngrok-stable-linux-arm64.zip
mv ngrok $PREFIX/bin/

# Configura con il tuo authtoken
ngrok config add-authtoken <TUO_TOKEN>

# Avvia tunnel
ngrok http 3001
```

L'URL HTTPS generato da ngrok può essere usato da qualsiasi dispositivo.

---

*Ultima modifica: 25 Febbraio 2026*
