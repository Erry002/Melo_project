# Raspberry Pi 3B – Setup Manuale

> 📌 Obiettivo: predisporre il Raspberry Pi come ambiente di test/manual deploy per il branch `test`

## 1. Preparazione Branch sul Mac

1. Aggiorna i riferimenti remoti:
   ```bash
   git fetch origin
   ```
2. Allinea il branch `test` con il lavoro recente (scegli merge o rebase):
   ```bash
   git switch test
   git merge origin/feature/mobile-ui
   # oppure
   # git rebase origin/feature/mobile-ui
   ```
3. Se servono modifiche da `audio-streaming-v1`, porta i commit su `test`:
   ```bash
   git switch test
   git merge audio-streaming-v1
   ```
4. Risolvi eventuali conflitti, quindi spingi:
   ```bash
   git push origin test
   ```

## 2. Prerequisiti Raspberry Pi

- Raspberry Pi OS Lite aggiornato (`sudo apt update && sudo apt upgrade`)
- SSH abilitato e accesso via Tailscale funzionante
- Spazio libero sufficiente su microSD/SSD
- Facoltativo: swap 1–2 GB e dissipazione adeguata per sessioni lunghe

## 3. Configurare Git e SSH su Raspberry

1. Installazione Git:
   ```bash
   sudo apt install git
   ```
2. Configura identità:
   ```bash
   git config --global user.name "Erry002"
   git config --global user.email "enricogarozzo002@gmail.com"
   ```
3. Genera la chiave SSH (accetta percorso predefinito):
   ```bash
   ssh-keygen -t ed25519 -C "enricogarozzo002@gmail.com"
   ```
4. Avvia l'agente ed aggiungi la chiave privata:
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519
   ```
5. Copia la chiave pubblica e incollala in GitHub → Settings → SSH Keys:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```
6. Testa la connessione:
   ```bash
   ssh -T git@github.com
   ```
   Dovresti ottenere `Hi Erry002! You've successfully authenticated...`.

## 4. Clonare e Allineare il Repository

1. Scegli una cartella di lavoro:
   ```bash
   mkdir -p ~/Projects
   cd ~/Projects
   ```
2. Clona il repository via SSH:
   ```bash
   git clone git@github.com:Erry002/Melo_project.git
   cd Melo_project
   ```
3. Passa al branch `test` e allinealo:
   ```bash
   git fetch origin
   git switch test
   git pull
   ```
4. Verifica lo stato:
   ```bash
   git status
   ```

## 5. Script di Supporto

> Rendi eseguibili con `chmod +x raspberry/*.sh raspberry/tests/*.sh`

### 5.1 Installazione dipendenze

```bash
./raspberry/install-deps.sh
```

Lo script:
- Aggiorna i pacchetti APT e installa tool base (git, build-essential, sqlite3, jq, ecc.)
- Installa/aggiorna Node.js `${NODE_MAJOR:-18}` e pm2
- Crea `logs/` e copia `raspberry/ngrok.yml` in `~/.config/ngrok` se mancante
- Mostra le versioni installate e, se presente, stampa `tailscale status`

### 5.2 Deploy manuale

```bash
./raspberry/manual-deploy.sh            # usa di default il branch test
./raspberry/manual-deploy.sh feature/x  # opzionale: specifica branch
```

Lo script:
- Effettua `git fetch` + `switch` + `pull --ff-only`
- Installa dipendenze backend/frontend e genera la build
- Avvia/ricarica pm2 con `raspberry/ecosystem.config.cjs` (solo processo `meluccio`, ngrok avviabile a parte con `pm2 start raspberry/ecosystem.config.cjs --only ngrok` dopo aver installato il binario)
- Esegue `pm2 save`, stampa `pm2 status` e chiama endpoint `/health`

> ℹ️ **Ngrok**: installa il binario ARM (`curl https://bin.equinox.io/...`) in `/usr/local/bin/ngrok`, registra l'authtoken (`ngrok config add-authtoken <TOKEN>`) e copia la config base in `~/.config/ngrok/ngrok.yml` prima di avviare il processo PM2.

### 5.3 Installazione e configurazione Ngrok

1. **Scarica il binario per Raspberry Pi 3B (armv7)**:
   ```bash
   curl -L https://bin.equinox.io/c/4VmDzA7iaHb/ngrok-v3-stable-linux-arm.zip -o /tmp/ngrok.zip
   unzip -j /tmp/ngrok.zip ngrok -d /tmp
   sudo install -m 755 /tmp/ngrok /usr/local/bin/ngrok
   ngrok version
   ```
   > Se usi un Pi con architettura a 64 bit, sostituisci l'URL con `.../ngrok-v3-stable-linux-arm64.zip`.

2. **Configura l'authtoken personale** (lo trovi nella tua dashboard ngrok):
   ```bash
   ngrok config add-authtoken <TOKEN_PERSONALE>
   ```
   > Se il comando restituisce `Unrecognized command: config` significa che è ancora presente ngrok v2. In quel caso usa `ngrok authtoken <TOKEN_PERSONALE>` oppure aggiorna il binario come indicato al punto 1 (assicurati che `ngrok version` riporti `3.x`).

3. **Copia il template di configurazione del repo** (include tunnel `meluccio` porta 3001):
   ```bash
   mkdir -p ~/.config/ngrok
   cp ~/Projects/Melo_project/raspberry/ngrok.yml ~/.config/ngrok/ngrok.yml
   ```

4. **Verifica l'accesso all'API locale** (facoltativo ma utile per i test):
   ```bash
   ngrok start --config ~/.config/ngrok/ngrok.yml --none &
   sleep 2
   curl -s http://127.0.0.1:4040/api/tunnels
   pkill -f "ngrok start"
   ```

5. **Avvio con PM2** (dopo il deploy):
   ```bash
   pm2 start ~/Projects/Melo_project/raspberry/ecosystem.config.cjs --only ngrok
   pm2 save
   ```
   Controlla URL e stato con `pm2 logs ngrok` oppure `curl http://127.0.0.1:4040/api/tunnels`.

## 6. Suite Test Raspberry

Directory: `raspberry/tests`

- `stress-http.sh [endpoint]` → usa `npx autocannon` per misurare throughput (`CONNECTIONS` e `DURATION` configurabili via env)
- `sqlite-health.sh` → controlla integrità/vincoli del database (`DB_PATH` variabile, `VACUUM=1` per compattare)
- `tunnel-check.sh` → riporta `tailscale status` e lo stato dei tunnel ngrok (`NGROK_API` configurabile)

## 7. Workflow di Deploy Manuale (Sintesi)

1. **Aggiorna branch sul Mac** (vedi sezione 1) e push
2. **Sul Raspberry**: `cd ~/Projects/Melo_project`
3. `./raspberry/install-deps.sh` (solo la prima volta o quando servono aggiornamenti)
4. `./raspberry/manual-deploy.sh`
5. Esegui i test:
   ```bash
   ./raspberry/tests/sqlite-health.sh
   ./raspberry/tests/tunnel-check.sh
   CONNECTIONS=15 DURATION=30 ./raspberry/tests/stress-http.sh
   ```

## 8. Prossimi Step Pianificati

- Benchmark Node/SQLite per valutare ottimizzazioni
- Piano backup per `database/backups/` e configurazioni ngrok/Tailscale
- Documentare eventuali tuning di pm2, Node e sistema operativo

Aggiorna questo file ad ogni modifica rilevante dell'ambiente Raspberry.
