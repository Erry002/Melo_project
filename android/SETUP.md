# 📱 Guida Setup — Meluccio Chat su Android (Termux)

> **Dispositivo testato**: Huawei Mate 10 Pro (Kirin 970 · ARM64 · Android 10)  
> **Branch**: `feature/android-support`

---

## Prerequisiti

1. Installa **Termux** da [F-Droid](https://f-droid.org/en/packages/com.termux/)
   > ⚠️ **Non usare la versione del Play Store** — è deprecata e non riceve aggiornamenti.

2. Installa **Termux:API** da F-Droid (per WakeLock e notifiche)

3. Concedi i permessi necessari:
   - Apri Impostazioni Android → App → Termux → Batteria → **Nessuna restrizione**
   - (opzionale) Impostazioni → App → Termux:API → Autorizzazioni → **tutte attive**

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

### `sqlite3` non si compila

```bash
# Opzione A: build forzata
cd ~/Melo_project
npm install sqlite3 --build-from-source

# Opzione B: reinstalla con flag espliciti
CFLAGS="-march=native" npm install sqlite3 --build-from-source
```

### Il server si ferma dopo qualche minuto

Android Doze Mode sospende i processi Termux. Soluzioni:

1. **Termux WakeLock** (automatico nello script `start.sh` se `termux-api` è installato)
2. **Batteria → Nessuna restrizione** per Termux nelle impostazioni Android
3. Tieni il device in carica durante i test

### Porta 3001 già in uso

```bash
# Trova e termina il processo sulla porta 3001
lsof -i :3001 2>/dev/null || ss -tlnp | grep 3001
# Non disponibili? Usa:
cat /proc/net/tcp | grep 0BB9  # 0BB9 = 3001 in hex
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
