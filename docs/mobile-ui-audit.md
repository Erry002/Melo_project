# 📱 Milestone 1 – Mobile UI/UX Audit
> Data: 27 novembre 2025  ·  Branch: `feature/mobile-ui`

## 🎯 Obiettivo
Raccogliere lo stato attuale dell'interfaccia su viewport mobile (320–414px), identificare gap di usabilità e impostare le priorità per le prossime milestone di ottimizzazione.

## 🔬 Metodologia
- Analisi del markup React/Tailwind nei componenti principali (`App.jsx`, `LoginForm.jsx`, `RegisterForm.jsx`, `UserProfile.jsx`).
- Revisione delle classi Tailwind per breakpoints e spacing.
- Valutazione euristica su touch target, gerarchia visiva, ordine dei contenuti e gestione degli scroll.
- Simulazione degli scenari critici: onboarding (login/register), dashboard/chat, profilo/modali.

## 🧭 Panoramica generale
- **Layout**: struttura pensata per desktop con numerosi pannelli simultanei; su mobile risulta lunga da scorrere e poco focalizzata sul contenuto primario.
- **Tipografia**: heading molto grandi (`text-3xl`/`text-4xl`) che saturano la viewport verticale su dispositivi piccoli.
- **Spacing**: padding orizzontali generosi (`px-6`/`px-8`) che rischiano di ridurre troppo l'area utile a 320px.
- **Interazioni**: pulsanti di controllo (es. microfono, switch canale) con altezza < 44px; le icone non hanno label su mobile.
- **Stato**: messaggi di errore e notifiche spesso testuali; assenza di feedback haptico/visivo rapido.

## 🔍 Findings per area

### 1. Schermate di autenticazione (Login / Register)
- **Card centrata fissa (`max-w-md`)**: su mobile resta utilizzabile ma l'header "Bentornato su Melo Chat" occupa ~40% della viewport prima del form.
- **Padding verticale**: `p-8` (32px) con spazio extra sopra e sotto; su 320px crea scroll inutile.
- **CTA secondarie**: link per cambiare form posizionato sotto il card, richiede ulteriore scroll.
- **Keyboard-safe area**: nessuna gestione specifica; su mobile virtual keyboard rischia di coprire i campi inferiori.

### 2. Dashboard / Chat (`App.jsx`)
- **Ordine contenuti**: su mobile l'`aside` (server & canali) precede il main chat. L'utente deve scorrere molto per arrivare alla conversazione.
  - Rilevato nel blocco `grid lg:grid-cols-[320px_1fr]` (~riga 560)
- **Header**: `text-4xl` + copy descrittivo; su schermi piccoli spinge i controlli fuori dalla prima viewport.
- **Pannelli multipli**: server list, utenti, cards info → layout uno sotto l'altro, lunghi da scorrere.
- **Bottoni audio (`🎤`, `🔇`)**: altezza ~48px ma senza label visibile; non c'è sticky control (perdita di contesto durante scroll).
- **Messaggistica**: container `px-6` e card `border` → area messaggi ridotta; timestamp `text-xs` ok ma c'è rischio di overflow per nomi lunghi.
- **Footer input**: nessuna sticky bar; l'input di chat può spostarsi fuori vista quando compare la tastiera.

### 3. Profilo & modali (`UserProfile.jsx`)
- **Layout**: grid `lg:grid-cols-3`; su mobile diventa colonna ma mantiene padding `p-8` e cards ricche di testo.
- **Avatar upload**: bottone camera sovrapposto, potrebbe risultare piccolo per tap.
- **Forms**: molteplici campi in card unica, richiedono scroll lungo; pulsanti CTA non sticky.

## ⚠️ Pain points prioritari (ranking)
1. **Riorganizzazione dashboard**: su mobile la chat deve apparire subito con controlli principali (mute/leave) sempre accessibili.
2. **Riduzione hero e paddings** nelle schermate auth e header dashboard.
3. **Introduzione di sticky / bottom bar** per controlli audio e input chat su mobile.
4. **Ottimizzazione modale profilo**: transizione a layout full-screen con tabs/step.
5. **Tipografia responsive**: rimodulare `text-3xl/4xl` → `text-2xl` su `<sm`, bilanciando line-height.

## 💡 Opportunità trasversali
- Definire breakpoints Tailwind condivisi (es. `sm` = 640px) e variabili di spazio/tipografia in `Global.css`.
- Creare hook per rilevare altezza tastiera mobile (gestione offset input chat).
- Introdurre bottom tab / floating action button per passare da chat a elenco utenti su mobile.
- Aggiungere indicatori visivi (badge, highlight) per microfono attivo / collegamento Ngrok.

## ✅ Output Milestone 1
- ✅ Documento di audit (questo file) con insights e priorità.
- ✅ Istanziazione branch dedicato `feature/mobile-ui`.
- ✅ Pianificazione shareable per team (vedi DEVLOG aggiornata).

## 🔜 Prossimi passi (Milestone 2)
1. Implementare layout responsivo di base in `App.jsx` (chat-first, controlli sticky).
2. Ridurre tipografia & paddings su `<sm` nei componenti auth.
3. Preparare set di utility Tailwind custom (es. `safe-bottom`, `mobile-card`).
4. Definire test devices: iPhone SE/12, Pixel 5, iPad mini (modal behaviour).

## ❓ Open questions
- Vogliamo introdurre una bottom nav persistente per server/canali/chat? RISPOSTA: Da discutere se è veramente necessaria o tenere una sidebar a scomparsa.
- Serve supporto landscape/mobile horizontal? (es. tablet) RISPOSTA: Si, molto utile per tablet.
- Ci sono requisiti di accessibilità specifici (contrast, prefer reduced motion)? RISPOSTA: le classiche opzioni di accessibilità che posso essere utili ad persone non vedenti, e tutto quello che può essere richiesto dalle norme vigenti
