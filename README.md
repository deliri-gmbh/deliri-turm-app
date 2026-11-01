# Deliri Turm-App

Checklisten für den Leiterbau im Betonturm (WLS Montage inkl. Bodenarbeiten und Finishing). Dazu kommen Mängel mit Foto, Unterschrift je Phase und ein Archiv aller Türme. Die App läuft im Browser am Handy und kann auf den Homescreen gelegt werden.

**Funktionen**
- Turm anlegen mit Windpark, WEA Nummer und Turmtyp (aktuell Nordex N23 Serie 0.1)
- Checkliste WLS und Finishing mit Ringmatrix C01 bis C29. Bei jedem Häkchen werden Name und Uhrzeit gespeichert.
- Kontrollmaß Leiter als Zahl mit Toleranzprüfung (138 mm ±5)
- Mängel melden mit Foto, Ort und benötigtem Ersatzteil. Offene Mängel stehen auf der Startseite und bei allen Türmen im selben Windpark, damit die nächste Truppe das richtige Teil mitnimmt.
- Abschluss je Phase mit Unterschrift. Nach dem Finishing landet der Turm im Archiv.
- Montageprotokoll je Turm zum Drucken bzw. als PDF
- Mehrere Leute können gleichzeitig am selben Turm arbeiten, die Ansicht aktualisiert sich live

Ohne Datenbank läuft die App im **Demo-Modus**: Alles bleibt dann nur auf dem einen Gerät. So kannst du sie sofort ausprobieren.

---

## Einrichtung (einmalig, ca. 20 Minuten)

### 1. Datenbank bei Supabase (kostenlos)
1. Auf https://supabase.com ein Konto anlegen, dann **New project**. Name `deliri-turm-app`, Region **Frankfurt (eu-central-1)**, ein Datenbank-Passwort vergeben und sicher aufheben.
2. Links **SQL Editor** öffnen und den Inhalt von `supabase/schema.sql` einfügen, dann **Run**. Damit sind Tabellen, Zugriffsregeln und der Fotospeicher angelegt.
3. **Authentication → Sign In / Providers**: *Allow new users to sign up* **ausschalten**. So kann sich niemand Fremder registrieren.
4. **Authentication → URL Configuration**: Bei *Site URL* die spätere App-Adresse eintragen (siehe Schritt 2), z.B. `https://DEINNAME.github.io/deliri-turm-app/`.
5. **Project Settings → API**: *Project URL* und den **anon public** Key kopieren. Beide in `config.js` eintragen. Den `service_role` Key **niemals** dort eintragen.

### 2. Online stellen mit GitHub Pages (kostenlos)
1. Auf https://github.com ein Konto anlegen und ein neues Repository `deliri-turm-app` erstellen (Public, oder Private mit GitHub Pro).
2. Alle Dateien aus diesem Ordner hochladen: **Add file → Upload files**, alles hineinziehen, **Commit**.
3. **Settings → Pages**: Source *Deploy from a branch*, Branch `main`, Ordner `/ (root)`, **Save**.
4. Nach 1 bis 2 Minuten läuft die App unter `https://DEINNAME.github.io/deliri-turm-app/`.

Alternativ geht es auch mit Netlify oder Cloudflare Pages: Ordner hineinziehen, fertig.

### 3. Team einladen
In Supabase unter **Authentication → Users → Invite user** die E-Mail-Adresse eingeben. Der Mitarbeiter bekommt einen Link, öffnet die App und gibt beim ersten Mal seinen Namen ein.

Anmelden geht später per Link an die E-Mail-Adresse. Wer lieber ein Passwort hat: In Supabase beim User *Send password recovery* wählen, oder du legst den User direkt mit Passwort an (**Add user → Create new user**).

### 4. Auf den Homescreen legen
- iPhone: In Safari öffnen, dann **Teilen → Zum Home-Bildschirm**
- Android: In Chrome öffnen, dann **⋮ → Zum Startbildschirm hinzufügen**

---

## Neuen Turmtyp hinzufügen
In `js/templates.js` steht die Vorlage für den N23. Für einen neuen Typ (z.B. Vestas T23) kopierst du das ganze `n23` Objekt, vergibst eine neue `id` und einen neuen `name` und passt Ringe und Punkte an. Ganz unten fügst du den Typ dann bei `window.TEMPLATES` hinzu.

Wichtig: Die `id` eines Punktes nachträglich nie ändern, sonst passen alte Häkchen nicht mehr.

Am schnellsten geht es, wenn du Claude das Polierpaket des neuen Turmtyps gibst und sagst: „Bau mir dafür eine Vorlage in templates.js“.

## Aufbau
```
index.html            Einstieg
config.js             Supabase Zugangsdaten (leer = Demo)
css/styles.css        Design (Deliri Gelb/Blau)
js/templates.js       Checklisten je Turmtyp
js/store.js           Datenzugriff Supabase bzw. Demo
js/app.js             Oberfläche
supabase/schema.sql   Datenbank, einmal ausführen
```

## Kosten
Supabase Free und GitHub Pages kosten 0 €. Der Free-Plan von Supabase reicht für ein kleines Team locker (500 MB Datenbank, 1 GB Fotos). Ein Projekt pausiert dort aber nach 7 Tagen ohne Nutzung und muss dann im Dashboard mit einem Klick wieder gestartet werden. Wenn das stört, kostet der Pro-Plan 25 $ pro Monat.
