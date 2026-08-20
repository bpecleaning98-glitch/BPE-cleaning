# BPE Cleaning: cabinetul clientei (ghid pentru Artiom)

Site Astro 5, insule React 19, Tailwind v4. Aproape tot e static și prerandat la build.
Adaptorul `@astrojs/vercel` există doar pentru cele câteva rute care trebuie să ruleze la
fiecare cerere: `/api/track`, `/api/lead`, `/go/[code]`, paginile de blog, `/sitemap.xml`,
`/robots.txt` și feedul `/blog/rss.xml`.
Datele stau în Supabase (Postgres, Auth, Storage). Nu există alt serviciu extern.

---

## 1. Ce s-a construit

Cabinetul e la `bpecleaning.ie/admin`. E o pagină separată, care nu folosește layoutul
site-ului: fără cursor custom, fără intro, fără scroll animat. Are `noindex, nofollow`,
deci nu ajunge în Google, și e exclusă din propriile statistici.

Cinci taburi: **Overview**, **Traffic**, **Campaign links**, **Blog**, **Requests**.

**Statistici proprii, fără Google Analytics.** Scriptul `src/scripts/track.ts` (în jur de
1 KB, încărcat din `Base.astro`) trimite către `/api/track` două lucruri: pagina deschisă
și cât timp a stat efectiv pe ecran. Scrierea în bază se face numai de pe server, cu cheia
service role, deci nimeni nu poate umfla cifrele din consola browserului. Boții sunt
filtrați după user agent și nu ajung în date.

**Linkuri de campanie cu QR.** Un cod scurt, de forma `bpecleaning.ie/go/flyer-oct`.
Ruta `src/pages/go/[code].ts` înregistrează clickul și face redirect 302 către destinația
setată, adăugând în adresă `utm_source`, `utm_medium`, `utm_campaign` și `k=cod`. De acolo
scriptul de tracking preia sursa și o ține toată sesiunea, deci se vede nu doar clickul,
ci și ce a făcut omul mai departe pe site.

**Blog cu publicare instant.** Articolele se scriu în cabinet și se salvează în tabelul
`posts`, pozele în bucketul de storage `blog`. Paginile publice se randează pe server la
fiecare cerere, deci un articol publicat e vizibil imediat, în HTML curat pentru Google,
fără redeploy și fără deploy hook. Un blog static ar fi avut nevoie de un rebuild la fiecare
articol, iar articolul ar fi apărut cu întârziere.

**Cereri din formular, cu sursa lor.** Formularul de ofertă deschide în continuare
WhatsApp, acolo unde clienta își ia efectiv rezervările, dar trimite aceeași cerere și
către `/api/lead`, care o salvează în tabelul `leads` împreună cu utm-urile, codul de link,
domeniul de proveniență, pagina de intrare și sesiunea. Dacă salvarea pică sau Supabase nu
e configurat, ruta răspunde tot 200 și WhatsApp se deschide oricum. Nu se pierde nicio
rezervare din cauza statisticilor. Formularul are și un câmp capcană ascuns (`company`),
completat doar de boți, iar cererile acelea se aruncă.

**Două porți la intrare, nu una.** Supabase Auth decide dacă ești logat. Tabelul
`admin_emails` decide dacă ai voie să vezi ceva. Un cont creat din greșeală trece de prima
poartă și se oprește la a doua. Verificarea reală e în politicile RLS din bază, nu în
interfață, deci nu se poate ocoli din browser.

---

## 2. Supabase

### 2.1 Proiect nou

1. supabase.com, **New project**. Regiune: **EU (Ireland) eu-west-1**, clienta și vizitatorii sunt în Dublin.
2. Notează parola de bază de date pe care ți-o cere la creare. Nu se mai poate citi după.

### 2.2 Unde sunt cheile

**Settings > API**. De acolo iei trei valori:

- `Project URL`, care devine `PUBLIC_SUPABASE_URL`
- cheia `anon` `public`, care devine `PUBLIC_SUPABASE_ANON_KEY`
- cheia `service_role` `secret`, care devine `SUPABASE_SERVICE_ROLE_KEY`

### 2.3 Schema

**SQL Editor > New query**, lipești TOT conținutul din `supabase/schema.sql`, apoi **Run**.
Fișierul e idempotent, se poate rula de câte ori vrei fără să strice nimic, deci dacă mai
adaugi ceva în el îl rulezi din nou întreg.

Creează tabelele `admin_emails`, `page_views`, `link_campaigns`, `link_clicks`, `leads`,
`posts`, bucketul `blog`, politicile RLS și funcțiile `stats_*` pe care le cheamă cabinetul.

### 2.4 Cine are voie în cabinet

Tot în SQL Editor, o singură dată:

```sql
insert into public.admin_emails (email, label) values
  ('bpecleaning98@gmail.com', 'BPE'),
  ('ark4su@gmail.com', 'ArtioMotion')
on conflict (email) do nothing;
```

Fără pasul ăsta, omul se loghează și vede ecranul "No access". Așa și trebuie.

### 2.5 Conturile

**Authentication > Users > Add user**, pentru fiecare adresă de mai sus: email și parolă,
cu **Auto Confirm User** bifat. Parola clientei o generezi tu și i-o dai prin WhatsApp, iar
ea și-o poate schimba după, prin linkul "Forgot the password" din ecranul de login.

### 2.6 OBLIGATORIU: închide înregistrarea publică

**Authentication > Sign In / Providers**, la Email: **Allow new users to sign up = off**.

Dacă rămâne pornit, oricine își poate face singur cont pe proiectul tău. Nu vede date,
pentru că `admin_emails` îl oprește, dar îți umple lista de utilizatori și e o ușă
deschisă degeaba. Se oprește o dată și gata.

### 2.7 Ca linkul de resetare a parolei să funcționeze

**Authentication > URL Configuration**:

- Site URL: `https://bpecleaning.ie`
- Redirect URLs: adaugă `https://bpecleaning.ie/admin` și, cât timp lucrezi local, `http://localhost:4380/admin` și `http://localhost:4381/admin`

Cabinetul cere resetarea cu redirect către `/admin` pe originea de pe care a fost cerută,
citită din `location.origin` în `AdminApp.tsx`. Dacă adresa nu e în lista de mai sus,
Supabase refuză redirectul și clienta ajunge într-o pagină de eroare.

Cele două porturi locale nu sunt o greșeală: `npm run dev` pornește pe 4380, iar
configurația de preview din `.claude/launch.json` pornește serverul pe 4381. Portul din
listă trebuie să fie exact cel pe care rulează serverul de pe care testezi.

---

## 3. Variabilele de mediu

| Variabila | De unde se ia | Publică sau secretă |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Supabase > Settings > API > Project URL | Publică. Ajunge în browser, e normal. |
| `PUBLIC_SUPABASE_ANON_KEY` | Supabase > Settings > API > anon public | Publică. Ajunge în browser. E protejată de RLS, singură nu deschide nimic. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Settings > API > service_role secret | **SECRETĂ.** Trece peste toate politicile RLS. Nu ajunge niciodată în browser și niciodată în git. |
| `ANALYTICS_SALT` | o inventezi tu, un șir lung și aleatoriu | **SECRETĂ.** Nu are valoare implicită. Fără ea amprenta zilnică pur și simplu nu se calculează. |

Regula simplă: doar ce începe cu `PUBLIC_` ajunge în bundle-ul de browser. Prefixul ăsta
nu se pune niciodată pe cheia service role. Dacă îl pui, publici cheia.

`ANALYTICS_SALT` intră în hashul zilnic al vizitatorilor și e citită în `src/lib/request.ts`.
Nu are valoare implicită, deliberat. Dacă nu e setată, `visitorHash()` returnează `null`:
paginile vizitate se înregistrează în continuare, dar vizitatorii unici nu se mai numără deloc.
Un salt implicit scris în sursă ar fi fost mai rău decât cifra pierdută, pentru că formula e
publică: cine are codul ar putea recalcula amprenta pentru un IP și un user agent presupuse,
ca să verifice dacă omul acela a intrat în ziua respectivă. Cu un salt propriu, secret, hashul
e exact ce promite capitolul 6. Concluzia practică: setează variabila înainte de primul deploy,
altfel pierzi numărul de vizitatori unici fără niciun alt semn că lipsește.

Dacă o schimbi, amprentele din ziua curentă se rup și aceiași oameni sunt numărați încă o
dată în ziua aceea. Datele vechi rămân intacte. Se setează o dată și nu se mai umblă la ea.

### Local

Copiezi `.env.example` în `.env` și completezi. `.env` e în `.gitignore`, nu se comite
niciodată. `.env.example` rămâne în repo, gol, ca să știe oricine ce variabile trebuie.

### Pe Vercel

**Project Settings > Environment Variables**. Adaugi toate patru, bifate pentru
**Production**, **Preview** și **Development**. Cheia service role se marchează ca
sensibilă, ca să nu mai poată fi citită după salvare.

Un detaliu care contează când rotești o cheie: rutele de server (`src/lib/db.ts`) citesc
întâi `process.env`, deci pentru ele o cheie nouă în Vercel se aplică imediat.
Variabilele `PUBLIC_` folosite de cabinet în browser sunt însă coapte în bundle la build,
deci după ce le schimbi e nevoie de un redeploy ca să aibă efect.

Fără variabile setate, site-ul public funcționează normal. Cabinetul afișează
"Not connected yet", trackingul tace, formularul deschide WhatsApp ca înainte.

---

## 4. Deploy pe Vercel

Proiectul rămâne static: fiecare pagină de marketing e HTML prerandat. Adaptorul există
doar pentru rutele care au `export const prerender = false`, adică `/api/track`,
`/api/lead`, `/go/[code]`, blogul, `/sitemap.xml`, `/robots.txt` și feedul `/blog/rss.xml`.

`robots.txt` și `sitemap.xml` sunt rute (`src/pages/robots.txt.ts`, `src/pages/sitemap.xml.ts`),
nu fișiere statice, tocmai ca linia `Sitemap:` și adresele din sitemap să urmeze originea pe
care rulează efectiv site-ul, inclusiv pe domeniul de preview. Nu pune niciodată un
`robots.txt` în `public/`: acolo fișierul static câștigă în fața rutei și o înlocuiește în
tăcere, cu o linie `Sitemap:` greșită pe orice alt domeniu.

1. Repo pe GitHub: `github.com/bpecleaning98-glitch/BPE-cleaning`, deja creat și populat.
2. Vercel > **Add New Project** > importă repo-ul. Framework preset: **Astro**. Build command `npm run build`, outputul e detectat automat prin adaptor. Nu suprascrie nimic.
3. **Environment Variables**: cele din capitolul 3, înainte de primul deploy.
4. Deploy. Verifică pe adresa `.vercel.app`: `/admin` cere login, `/go/test` te duce pe prima pagină (cod inexistent, redirect spre home, e comportamentul corect), iar în Supabase > Table Editor > `page_views` trebuie să apară rânduri după ce navighezi două pagini.

### Domeniul bpecleaning.ie

1. Vercel > **Settings > Domains** > adaugă `bpecleaning.ie` și `www.bpecleaning.ie`, cu www redirecționat spre apex. În `astro.config.mjs`, `site` e deja `https://bpecleaning.ie`.
2. La registrar pui exact valorile pe care ți le arată Vercel în ecranul acela, nu cele pe care le ții minte din alt proiect. Vercel schimbă IP-urile de A record din când în când.
3. **Atenție la DNS.** Modifici doar înregistrările A și CNAME. Înregistrările **MX și TXT rămân neatinse**, altfel pică emailul companiei. E capcana clasică la mutarea unui domeniu.
4. Dacă domeniul e înregistrat pe numele clientei, ai nevoie de accesul ei la panoul registrarului. Cere-l din timp, la `.ie` verificarea de identitate poate dura.
5. SSL se emite automat de Vercel după ce DNS-ul se propagă, în general în câteva minute, uneori câteva ore. Nu porni nimic manual.
6. După lansare: Google Search Console, adaugă domeniul și trimite sitemap-ul.

---

## 5. Cum se folosește cabinetul

Capitolul ăsta e scris ca să poată fi tradus și trimis clientei așa cum e.

Adresa: **bpecleaning.ie/admin**. Email și parolă primite de la Artiom. Merge la fel de
bine pe telefon ca pe calculator.

Sus, în taburile Overview și Traffic, e selectorul de perioadă: 7 zile, 30 de zile,
90 de zile, 12 luni. Perioadele se calculează pe zile întregi, de la miezul nopții, deci
"7 zile" înseamnă șapte zile complete, nu ultimele 168 de ore.

### Overview

Cifrele mari, pentru perioada aleasă:

- **Visitors**, câți oameni diferiți au intrat. Numărătoarea e pe zi: cine revine peste o săptămână e numărat încă o dată, pentru că amprenta anonimă se schimbă în fiecare noapte. Nu e o eroare, e prețul faptului că nu urmărim pe nimeni.
- **Sessions**, câte vizite. O vizită înseamnă un tab deschis, de la intrare până la închidere. Același om care intră dimineața și seara face două vizite.
- **Views**, câte pagini au fost deschise în total.
- **Avg time**, cât durează în medie o vizită. Se numără doar timpul în care pagina e efectiv pe ecran: un tab lăsat deschis peste noapte nu adaugă ore false.
- **Requests**, câte cereri de ofertă au venit din formular.
- **Link clicks**, câte clickuri au primit linkurile de campanie.

Sub ele, graficul pe zile. Cifra care contează cel mai mult nu e numărul de vizitatori,
ci raportul dintre vizite și cereri: câte vizite trebuie ca să iasă un client.

### Traffic

- **Surse**, de unde vin oamenii: Facebook, Google, Instagram, WhatsApp, Direct (adică au scris adresa sau au dat click pe un link salvat). Variantele aceluiași loc, cum sunt `m.facebook.com` și `l.facebook.com`, sunt puse împreună sub "Facebook".
- **Pagini**, care pagini se deschid cel mai des și cât se stă pe ele.
- **Dispozitive**, telefon, tabletă, calculator. La serviciile astea, în Dublin, majoritatea e pe telefon.
- **Locuri**, țara și orașul, atât cât se poate deduce din rețeaua prin care intră omul. E aproximativ și e în regulă să fie.

### Campaign links

Aici se face un link scurt pentru fiecare loc unde se face reclamă, ca să se vadă negru pe
alb ce aduce clienți și ce nu.

1. **New link**. Cod scurt, de exemplu `flyer-oct`, deci linkul devine `bpecleaning.ie/go/flyer-oct`.
2. Eticheta, ca să se știe ce e: "Flyere octombrie, Rathmines".
3. Destinația, adică pagina spre care duce, de exemplu prima pagină sau pagina de prețuri.
4. Opțional, o dată de expirare, pentru o ofertă care se termină.
5. Salvezi și primești linkul și codul QR. QR-ul se descarcă și se pune pe flyer, pe cartea de vizită sau pe mașină.

În tabel se vede, pentru fiecare link, câte clickuri a adus și câte **cereri** au ieșit din
ele. Clickurile arată interesul, cererile arată banii.

**De ce un link expirat tot funcționează.** Când o campanie se termină sau e oprită, linkul
nu duce la o pagină de eroare, ci pe prima pagină a site-ului. Clickul se înregistrează
separat, marcat ca expirat, ca să nu strice cifrele campaniei încheiate. Motivul e simplu:
flyerele deja tipărite rămân prin case luni de zile, iar un flyer care duce la o eroare e
un client pierdut.

### Blog

Un articol nou apare pe site în secunda în care apeși Publish. Nu trebuie anunțat nimeni,
nu trebuie așteptat nimic.

1. **New post**. Titlul. Adresa articolului se compune singură din titlu, dar poate fi modificată.
2. Poza de copertă, încărcată direct. Scrie și un text scurt care descrie poza, e pentru oamenii care folosesc cititoare de ecran și pentru Google.
3. Textul. Se scrie normal. Un rând care începe cu `## ` devine subtitlu, un rând care începe cu `- ` devine punct de listă, iar `**text**` iese îngroșat.
4. Rezumatul scurt, cel care apare în lista de articole și în Google. Dacă îl lași gol, se ia începutul articolului.
5. Titlul și descrierea pentru Google, dacă vrei altceva decât titlul articolului.
6. **Publish**. Cât timp comutatorul e pe draft, articolul e vizibil doar în cabinet.

Ce merită scris: răspunsuri la întrebări reale ale clienților, de exemplu cât costă o
curățenie de final de chirie în Dublin sau cum se pregătește un apartament înainte de
inspecție. Astea aduc oameni din Google luni întregi după ce au fost scrise.

### Requests

Fiecare cerere trimisă din formularul de pe site, cu nume, telefon, serviciu, zonă și data
dorită, și cu **sursa** ei: din Facebook, din Google, dintr-un flyer cu QR.

Fiecare cerere are un status, **New**, **Contacted**, **Booked** sau **Closed**, plus un
câmp de notițe proprii. Nu înlocuiește WhatsApp-ul, unde se lucrează în continuare. E
evidența, ca să nu se piardă nimeni și ca să se vadă la sfârșit de lună ce canal a adus
bani cu adevărat.

---

## 6. Confidențialitate

Ce nu face site-ul:

- **fără cookies**, niciunul, nici măcar ale noastre
- **fără Google Analytics**
- **fără pixel de Facebook** și fără niciun alt script de la terți
- **nu se salvează adrese IP**, nicăieri, în nicio tabelă

Ce face în schimb:

- Fiecare vizită primește un număr aleatoriu care trăiește doar în tabul deschis (`sessionStorage`) și dispare când tabul se închide. Nu se scrie nimic pe disc.
- Vizitatorii unici se numără printr-un hash zilnic, calculat din ziua curentă, IP, user agent și un secret. Hashul se schimbă la fiecare miez de noapte, deci nu poate urmări pe nimeni de la o zi la alta. IP-ul intră în calcul, dar nu se salvează niciodată.
- Din adresa de proveniență se păstrează doar domeniul, de exemplu `facebook.com`, niciodată adresa completă a paginii de unde a venit omul.
- Țara și orașul vin din headerele rețelei Vercel, aproximativ, și atât.
- Semnalul **Global Privacy Control** e respectat: dacă browserul cuiva îl trimite, scriptul de tracking nu pornește deloc.
- Boții sunt filtrați și nu ajung în cifre.

**Concluzia practică:** nu e nevoie de banner de cookies, pentru că nu există cookies și nu
există niciun terț. E un avantaj real, banner-ul strică prima impresie pe toate site-urile
concurenței.

**Pagina de politică de confidențialitate există** și spune exact asta:
`src/pages/privacy.astro`, cu link discret în footer (`src/components/Footer.astro`). E
scrisă după cod, nu după un șablon: ce se măsoară și cum (fără cookies, hash zilnic, fără IP
stocat), faptul că formularul salvează nume, telefon, serviciu, zonă, dată dorită și
notițele, în Supabase, de ce, cine are acces la ele, și cum se cere o copie sau ștergerea,
prin telefon sau WhatsApp. Comentariul din capul fișierului listează sursele pe care se
sprijină fiecare afirmație, deci dacă se schimbă `track.ts`, `api/track.ts` sau
`api/lead.ts`, pagina se schimbă odată cu ele.

Un singur lucru îi lipsește: **perioada de păstrare**. GDPR cere să scrie cât timp se țin
datele, iar pagina nu spune nimic despre asta. Stabilește un termen cu clienta, de exemplu
24 de luni pentru cereri, și scrie-l în secțiunea "Your requests".

---

## 6b. Protecția datelor, ce trebuie să știi ca să nu strici promisiunea

Pagina `/privacy` nu e un text de umplutură. Fiecare frază de acolo descrie ce
face codul, iar două dintre ele sunt promisiuni cu termen: statistica de vizite
se șterge la 13 luni, cererile de ofertă la 24 de luni de la ultima atingere.
Nu depind de memoria nimănui, le execută funcția `purge_old_data()` din
`schema.sql`, programată prin pg_cron în fiecare noapte la 03:10. Dacă schimbi
termenele în bază, schimbă și pagina. Dacă schimbi pagina, schimbă și baza.

**Ștergerea la cerere.** Cineva poate cere ștergerea datelor lui. Ștergi cererea
din tab-ul Requests și gata: `session_id` de pe cerere era singura legătură
dintre un om cu nume și rândurile de trafic, iar fără ea rândurile acelea nu mai
identifică pe nimeni. Dacă vrei totuși curățenie completă, rulează în SQL Editor,
cu rol de service, `delete from public.page_views where session_id = '<id-ul de
pe cerere>';` înainte să ștergi cererea, altfel pierzi id-ul.

**Exportul CSV e o copie care iese din regulă.** Fișierul descărcat din Requests
ajunge pe telefonul sau laptopul de pe care ai deschis cabinetul, iar de acolo
nici ștergerea automată din bază, nici butonul de ștergere nu îl mai ating.
Tratează-l ca pe o copie de lucru: îl ștergi când ai terminat treaba pentru care
l-ai descărcat și nu îl trimiți în afara firmei.

**Regiunea contează.** Proiectul Supabase se creează în EU (Ireland), iar pagina
de privacy spune clientelor că datele stau pe servere din Uniunea Europeană.
Dacă proiectul ajunge din greșeală într-o regiune din SUA, afirmația devine
falsă și trebuie fie mutat proiectul, fie rescrisă pagina.

---

## 7. Ce a rămas de făcut

Lista sinceră, verificată în cod pe 18 august 2026:

1. **Proiectul Supabase nu e creat.** Tot capitolul 2 e de făcut de la zero, iar `.env` nu există încă.
2. **Importul în Vercel.** Repo-ul există pe GitHub; ce lipsește e proiectul Vercel legat de el și variabilele de mediu din capitolul 3.
3. **Domeniul nu e legat.** Trebuie clarificat cu clienta unde e înregistrat `bpecleaning.ie` și cine are acces la DNS.
4. **Perioada de păstrare a datelor nu e scrisă nicăieri.** Pagina `/privacy` acoperă tot restul, dar nu spune cât timp se țin cererile. Stabilește un termen cu clienta și adaugă-l acolo.
5. **Regenerarea logourilor**, dacă designerul livrează vreodată o versiune nouă: pui SVG-urile noi peste cele din `brand/svg/`, apoi `node scripts/build-marks.mjs` (rescrie `src/data/marks.ts`) și `node scripts/build-icons.mjs` (rescrie favicon, icoanele de app și cardul social). Ambele scripturi citesc din repo, nu de pe disc.
6. **Google Business Profile și Search Console**, după lansare.
7. **Testează pe telefon.** Cabinetul se deschide cel mai des de pe telefon.

Codul propriu-zis e complet: cele cinci taburi ale cabinetului, blogul public cu `/blog`,
`/blog/[slug]` și feedul RSS, `sitemap.xml`, `robots.txt` și pagina de confidențialitate
există toate în `src/pages` și `src/components/admin`.
