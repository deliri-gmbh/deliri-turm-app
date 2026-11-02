// Checklisten-Vorlagen je Turmtyp.
// Neue Turmtypen: Objekt kopieren, id/name ändern, Punkte anpassen.
// Wichtig: Die id eines Punktes nie ändern, sonst gehen alte Häkchen verloren.

(function () {
  const pad = n => 'C' + String(n).padStart(2, '0');
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  // ---------- Nordex N23 Serie 0.1 (Max Bögl Betonturm) ----------
  const N23_PANELS = {
    C01:'0113786',C02:'0113795',C03:'0113785',C04:'0113785',C05:'0113784',C06:'0113785',C07:'0113787',
    C08:'0113790',C09:'0113788',C10:'0113788',C11:'0113790',C12:'0113788',C13:'0113788',C14:'0113791',
    C15:'0113798',C16:'0115304',C17:'0115303',C18:'0113798',C19:'0115304',C20:'0115303',C21:'0113797',
    C22:'0115304',C23:'0115303',C24:'0113798',C25:'0115303',C26:'0115309',C27:'0114590',C28:'0115311',C29:'0115312'
  };
  const N23_STRUT_RINGS = [...range(1, 15), 18, 21, 24, 27];
  const strutType = n => n <= 5 ? 'C01-C05' : n <= 10 ? 'C06-C10' : n <= 21 ? 'C11-C23' : n === 24 ? 'C24-C31' : 'C32-ZXX';

  const ringCols = [
    { id: 'fss',   label: 'FSS',   help: 'Verbinder Fallschutzschiene vor Hub geprüft' },
    { id: 'verb',  label: 'Verb.', help: 'Mit 4× M16x35 verbunden, Fallschutzschiene gestoßen' },
    { id: 'spalt', label: 'Spalt', help: 'Spaltmaß +1 bis +4 mm' },
    { id: 'pos',   label: 'Pos.',  help: 'Schraube Strebe/Konsole in richtiger Bohrung' },
    { id: 'ring',  label: 'Ring',  help: 'Im Ring befestigt (C01: 8× M12x40, sonst 4× M12x30)' },
    { id: 'erd',   label: 'Erd.',  help: 'Erdungsaufkleber Phönix 16 mm an beiden Wandkonsolen' },
    { id: 'kons',  label: 'Kons.', help: 'Konsolen + Abstrebungen (M12x80, Distanzhülse)' }
  ];
  const ringApplies = (c, n) => ({
    fss: n >= 2, verb: n >= 2, spalt: n >= 2,
    pos: n >= 26 && n <= 28,
    ring: n <= 28,
    erd: [7, 14, 21, 28].includes(n),
    kons: N23_STRUT_RINGS.includes(n)
  })[c];

  const n23 = {
    id: 'n23-s01',
    name: 'Nordex N23 Serie 0.1',
    customer: 'Max Bögl',
    source: 'Polierpaket N23 Serie 0.1, Montageanweisungen WEA0115731 bis WEA0115734, TM16 bis TM126',

    // Ablauf Leitermontage (Info-Reiter)
    flow: [
      ['Start auf der Adapterplattform', 'Plattform sitzt und ist verschraubt. Abdeckungen über der Verschraubung abnehmen (4 Garnituren M8). Die vier temporären Abstandhalter an C01 entfernen.'],
      ['Leiterinnenverbinder setzen', 'Oben an der Leiter von C01 montieren. Laut Anweisung in der Holzkiste der Gitterscheibenlieferung, laut TM48 im Faltkarton LP2.'],
      ['C01 anheben und an der Plattform verschrauben', '8 Garnituren M16x40. LK Profile müssen durch die Plattformöffnung passen, Drahtseil darf nicht zwischen PE Platte und Gitterscheibe klemmen.'],
      ['Leiter ablassen, Fallschutzschiene verbinden', 'Schrauben lockern, Leiter ablassen, festziehen, Verbinder der Fallschutzschiene setzen. Spaltmaß sofort prüfen.'],
      ['Kontrollmaß 138 mm ±5 mm', 'Von OK Leiter bis OK Adapter, nicht von OK Innenverbinder. Wert ins Abnahmeprotokoll. Bei Abweichung Leiter korrigieren.'],
      ['C01 im Ring befestigen', '8 Garnituren M12x40, danach Konsolen und Abstrebungen in C01.'],
      ['Schleife C02 bis C29', 'Verbinder prüfen, anheben, 4× M16x35 verbinden und Fallschutzschiene stoßen, Spaltmaß prüfen, im Ring mit 4× M12x30 befestigen. Sonderpunkte je Ring in der Ringmatrix.'],
      ['Bis OK Fundament ergänzen', 'Unterste Sonderscheibe anschließen, Bodenbefestigung links und rechts mit Spreizankern, letzter Spaltmaß Check.'],
      ['Leiterabnahme', 'Durch geschulte Fachkraft nach Leiterabnahmeprotokoll, Avanti Montageprotokoll V_3106.']
    ],

    // Besonderheiten (Info-Reiter)
    hints: [
      ['hot', 'Verbinder Fallschutzschiene', 'Anweisung sagt vormontiert, TM61 sagt bei Nordex Avanti lose im Faltkarton LP2 (Mat. 2171703). Vor jedem Hub prüfen.'],
      ['hot', 'Leiterverbinder', 'Holzkiste laut Anweisung, Faltkarton LP2 laut TM48. Beide Orte prüfen und vor dem ersten Hub vollzählig haben.'],
      ['hot', 'Bodenbefestigung', 'TM55 (15.06.2026) ersetzt WEA0043164/65 durch WEA0121777/78 mit vormontierten ISO7040 Muttern und tauscht die Positionen links und rechts.'],
      ['warn', 'Spaltmaß', 'Fallschutzschiene +1 bis +4 mm direkt nach jedem Stoß prüfen.'],
      ['warn', 'Kabelschellen', 'Montieren, solange die Gitterscheibe noch am Merlo hängt (TM30). Plan WEA0090781 je Scheibe.'],
      ['warn', 'Konsolen', 'C01 schräge Konsole WEA0112436, kleiner Winkel (78°) nach außen. Sonst 90° Konsole. Dübel 450 mm unter Ringoberkante. Bilder zeigen links, rechts spiegeln. Muttern zur Gitterstruktur hin (TM122).'],
      ['warn', 'Abstrebung', 'Seite mit nur einer Mutter kommt an die Wandkonsole. Gewindestange komplett eingeschraubt.'],
      ['warn', 'C26 bis C28', 'Schraube Strebe zu Konsole in der richtigen Bohrung, Lochbild je Ring verschieden.'],
      ['warn', 'Langlöcher', 'Nur große Scheiben ISO7093. Aufbohren maximal 14 auf 24 mm, Randabstand mindestens 10 mm (TM122).'],
      ['warn', 'Gekröpfte Streben', 'M6x20 A2 statt Nieten, Kopf zum Profilmittelpunkt, 10 Nm (TM21).'],
      ['info', 'Flugbefeuerung', 'Kabelführung beim N23 AT im C02, nicht im C16 wie im WLS Plan gezeichnet.'],
      ['info', 'Sicherheit', 'Beim Anheben nicht unter die Adapterplattform greifen. Fundamentabdeckung trägt max. 150 kg.'],
      ['info', 'Fehlt im Polierpaket', 'Einheben Adapterplattform (WEA0115729/30), Kabelschellen (WEA0090781), Avanti Anleitung, aktuelle Hailo Anleitung.']
    ],

    phases: {
      wls: {
        title: 'WLS Montage inkl. Bodenarbeiten',
        sections: [
          { title: 'Vorbereitung', items: [
            { id: 'v1', text: 'Faltkarton Lieferpaket 2 gefunden: Leiterverbinder, Fallschutzschienenverbinder, Futterbleche', ref: 'TM48 TM61' },
            { id: 'v2', text: 'Holzkiste mit Leiterinnenverbindern vorhanden' },
            { id: 'v3', text: 'Montageanleitung Avanti und Montageprotokoll V_3106 dabei' },
            { id: 'v4', text: 'Spaltmaßprüfbleche, 2 m Wasserwaage, Meterstab, Kreuzlinienlaser' },
            { id: 'v5', text: 'Große Scheiben ISO7093 M12 als Reserve', ref: 'TM122' },
            { id: 'v6', text: 'Loctite mittelfest, Castrol Optimol Paste für Edelstahl' },
            { id: 'v7', text: 'Hilti TE 7 mit Bohrer 12 mm, Spreizanker W‑FAZ M12x110 und M10x95' },
            { id: 'v8', text: 'Gitterscheiben C01 bis C29 und Sonderscheibe unten vollständig' }
          ]},
          { title: 'Start oben, Ring C01', items: [
            { id: 's1', text: 'Abdeckungen über Verschraubung entfernt (M8x25, M8x35)' },
            { id: 's2', text: '4 temporäre Abstandhalter an C01 entfernt' },
            { id: 's3', text: 'Leiterinnenverbinder oben an der Leiter C01 montiert' },
            { id: 's4', text: 'C01 angehoben, LK Profile frei, Drahtseil nicht geklemmt' },
            { id: 's5', text: 'C01 an Adapterplattform mit 8× M16x40 verschraubt' },
            { id: 's6', text: 'Verbinder Fallschutzschiene geprüft bzw. gesetzt' },
            { id: 's7', text: 'Leiter abgelassen, festgezogen, Fallschutzschiene verbunden' },
            { id: 's8', text: 'Spaltmaß Fallschutzschiene +1 bis +4 mm' },
            { id: 's9', text: 'Kontrollmaß OK Leiter bis OK Adapter (Soll 138 mm ±5)', input: 'mm', min: 133, max: 143 }
          ]},
          { title: 'Ringmatrix C01 bis C29', type: 'matrix',
            note: 'Nur Felder, die laut Montageanweisung für den Ring gelten.',
            cols: ringCols,
            rows: range(1, 29).map(n => ({
              id: pad(n), label: pad(n), sub: N23_PANELS[pad(n)],
              cells: ringCols.filter(c => ringApplies(c.id, n)).map(c => c.id)
            }))
          },
          { title: 'Abschluss oben', items: [
            { id: 'a1', text: 'Abdeckungen und Liftshielding Bleche wieder verschraubt' },
            { id: 'a2', text: 'Kabelführung Flugbefeuerung C02 montiert, 270° umlaufend', ref: 'WEA0106870' },
            { id: 'a3', text: 'Alle Schraubverbindungen markiert' }
          ]},
          { title: 'Bodenarbeiten', items: [
            { id: 'b1', text: 'Sonderscheibe Unten_Sonder_K_L (WEA0115313) mit 4× M16x35 angeschlossen' },
            { id: 'b2', text: 'Fallschutzschiene verbunden, Spaltmaß +1 bis +4 mm' },
            { id: 'b3', text: 'Teile Bodenbefestigung geprüft (neu WEA0121777/78)', ref: 'TM55' },
            { id: 'b4', text: 'Bodenbefestigung links/rechts mit 4× W‑FAZ M12x110, Positionen laut TM55 getauscht' },
            { id: 'b5', text: 'Schachtabdeckung: Stahlträger mit Unterlegblechen ausgerichtet', ref: 'WEA0080184' },
            { id: 'b6', text: 'Schachtabdeckung: Bleche zuerst an Träger, dann Dübellöcher anzeichnen und bohren' },
            { id: 'b7', text: 'Öffnungen bis Einhub Elektrokomponenten abgedeckt (max. 150 kg)' },
            { id: 'b8', text: 'Geländer Fundament und Gitterrinnen OBO GRM montiert', ref: 'WEA0092093' },
            { id: 'b9', text: 'Spreizanker M10x95 für Hailo Seilumlenkung gesetzt', ref: 'TM64' },
            { id: 'b10', text: 'Edelstahlschrauben mit Castrol Optimol Paste' },
            { id: 'b11', text: 'Bottom Box: Dübelgröße Anfängerring bestimmt, passende Schraube, ggf. auf Ø14 aufgebohrt', ref: 'TM126' },
            { id: 'b12', text: 'Bottom Schaltschrankhalterung mit 4× W‑FAZ M12x110, Ausrichtung geprüft', ref: 'WEA0079616' },
            { id: 'b13', text: 'Leiterabnahme durch geschulte Fachkraft, Protokoll unterschrieben' },
            { id: 'b14', text: 'Fotodoku: Kontrollmaß, Bodenbefestigung, Erdungsaufkleber, Abstrebungen' }
          ]}
        ]
      },
      fin: {
        title: 'Finishing',
        sections: [
          { title: 'Voraussetzung', items: [
            { id: 'p1', text: 'Spannglieder sind eingezogen' },
            { id: 'p2', text: 'Steigleiter Fundament bis Adapterplattform fertig und abgenommen' },
            { id: 'p3', text: 'PSA Punkt neben dem Geländer der Adapterplattform vorhanden' },
            { id: 'p4', text: 'Aktuelle Hailo Montageanleitung vor Ort' }
          ]},
          { title: 'Abstrebungen je Ring', type: 'matrix',
            note: 'Abstand X laut Tabelle herausdrehen. Montieren mit Kopfbolzen, Scheibe, Biegesplint 4x32. Einstellen: Kontermutter M16 lösen, mit Blick zur Turmwand Vierkantrohr im Uhrzeigersinn beidseitig gleichmäßig bis Formschluss, WLS quer zur Leiter bewegen, nachprüfen, dann +90°. Kontermutter mit Loctite, mit Farbe markieren. Max. 100 mm Überstand.',
            cols: [
              { id: 'x', label: 'Abst. X', help: 'Gewindestangen auf Abstand X' },
              { id: 'mont', label: 'Mont.', help: 'Montiert, Biegesplint gesetzt' },
              { id: 'einst', label: 'Einst.', help: 'Formschluss + 90°' },
              { id: 'sich', label: 'Ges.', help: 'Kontermutter Loctite, markiert' }
            ],
            rows: N23_STRUT_RINGS.map(n => ({ id: pad(n), label: pad(n), sub: strutType(n), cells: ['x', 'mont', 'einst', 'sich'] }))
          },
          { title: 'Plattform und Lift', items: [
            { id: 'l1', text: 'Am PSA Punkt eingehängt, Luken geschlossen, Abdeckblech montiert' },
            { id: 'l2', text: 'PSA Anschlagpunkt lang (WEA0089766) mit 2 Garnituren, Loctite' },
            { id: 'l3', text: 'Futterbleche Geländer falls nötig (max. 5), PSA Galgen fluchtet', ref: 'TM16' },
            { id: 'l4', text: 'Deckel Einlegeblech abgenommen und auf Plattform gelagert' },
            { id: 'l5', text: 'Lifttraverse WEA0076282 mit 5 Garnituren, Loctite' },
            { id: 'l6', text: 'Liftseile eingehängt: H1 Tragseil, H2 Sicherheitsseil, S leer' },
            { id: 'l7', text: 'Drahtseil 84 m (T0263589) geprüft', ref: 'TM64' },
            { id: 'l8', text: 'Interlock: Riegel an Geländerelement, Schalter an Geländertür (Elektrik Nordex)' },
            { id: 'l9', text: 'Seilumlenkung Hailo T0251165 montiert' },
            { id: 'l10', text: 'Einhausung Seilgewicht Hailo T0251164 montiert' },
            { id: 'l11', text: 'Alte MB Liftaufständerung, falls geliefert: nicht einbauen, entsorgen', ref: 'TM64' },
            { id: 'l12', text: 'Lift: vordere Führungsrollen ab, in Liftfreiraum Richtung Leiter' },
            { id: 'l13', text: 'Führungsrollen wieder dran, Lift mittig, Rollen an Leiterholmen ausgerichtet' },
            { id: 'l14', text: 'Schaltteller 1650 mm unter temporärer Lifttraverse' },
            { id: 'l15', text: 'Ständer Bottom Box montiert', ref: 'WEA0079616' },
            { id: 'l16', text: 'Liftgeländer montiert, Luken eingehängt' },
            { id: 'l17', text: 'Erdungskabel Liftgeländer zum Turmfuß 70 cm', ref: 'TM102' }
          ]},
          { title: 'Abschluss', items: [
            { id: 'e1', text: 'Alle Schraubverbindungen markiert' },
            { id: 'e2', text: 'Demontierte Teile samt Garnituren für Max Bögl gesammelt' },
            { id: 'e3', text: 'Übrige Futterbleche mit Übergabepaket im Turmfuß' },
            { id: 'e4', text: 'Fotodoku Abstrebungen, Lift, Interlock, Schaltteller' }
          ]}
        ]
      }
    }
  };

  // Alle Punkte einer Phase als flache Liste [{key, label}]
  function flatItems(tpl, phase) {
    const out = [];
    tpl.phases[phase].sections.forEach(sec => {
      if (sec.type === 'matrix') {
        sec.rows.forEach(r => r.cells.forEach(c => {
          const col = sec.cols.find(x => x.id === c);
          out.push({ key: r.id + '-' + c, label: r.label + ' ' + col.help });
        }));
      } else sec.items.forEach(it => out.push({ key: it.id, label: it.text, unit: it.input === 'mm' ? ' mm' : '' }));
    });
    return out;
  }

  // Was wurde an einem Tag erledigt? dayChecks = Häkchen mit done_at an diesem Tag.
  // Ergebnis: [{ section, text }] in lesbarer Kurzform für den Tagesbericht.
  function summarizeDay(tpl, phase, dayChecks) {
    const ids = new Set(dayChecks.filter(c => c.phase === phase).map(c => c.item_id));
    const out = [];
    tpl.phases[phase].sections.forEach(sec => {
      if (sec.type === 'matrix') {
        const rows = sec.rows.filter(r => r.cells.some(c => ids.has(r.id + '-' + c))).map(r => r.label);
        if (rows.length) out.push({ section: sec.title, text: 'bearbeitet ' + ranges(rows) });
      } else {
        const done = sec.items.filter(it => ids.has(it.id)).map(it => it.text);
        if (done.length) out.push({ section: sec.title, text: done.join('; ') });
      }
    });
    return out;
  }
  // C05, C06, C07, C09 -> "C05 bis C07, C09"
  function ranges(labels) {
    const nums = labels.map(l => [l, parseInt(l.replace(/\D/g, ''), 10)]);
    const parts = []; let i = 0;
    while (i < nums.length) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1][1] === nums[j][1] + 1) j++;
      parts.push(j - i >= 2 ? nums[i][0] + ' bis ' + nums[j][0] : nums.slice(i, j + 1).map(n => n[0]).join(', '));
      i = j + 1;
    }
    return parts.join(', ');
  }

  window.TEMPLATES = { [n23.id]: n23 };

  // Gilt für jeden Turmtyp: vor dem Start der WLS die Nummern für das Protokoll erfassen
  const START_SECTION = { title: 'Vor dem Start: Nummern fürs Protokoll',
    note: 'Bitte vor Beginn der WLS Montage eintragen.',
    items: [
      { id: 'fauf', text: 'FAUF-Nr. (Zettel auf Gitterscheibe Nr. 1, Barcode-Nummer unten links)', input: 'text', numeric: true, placeholder: 'z.B. 11216520', check: '^\\d{6,10}$' },
      { id: 'leiter_sn', text: 'Seriennummer der Leiter (Sticker auf der Leiter C01)', input: 'text', placeholder: 'Seriennummer' }
    ] };
  // Gilt für jeden Turmtyp: Vormontage, solange die Gitterscheiben noch am Boden bzw. auf der Palette liegen
  const PREASSEMBLY_SECTION = { title: 'Vormontage am Boden',
    note: 'Solange die Gitterscheiben mit den Leiterelementen noch am Boden liegen, gleich alle durchgehen.',
    items: [
      { id: 'vm_verbinder', text: 'Fallschutzschienen-Verbinder (Stahlstück mit 2 Schrauben, verbindet die Schiene mit der nächsten) bei allen Gitterscheiben eingeschoben und festgezogen, sodass er sich nicht bewegt', img: 'img/fss-verbinder.jpg' },
      { id: 'vm_loctite', text: 'Alle Schrauben (M10 / M12) mit Loctite gesichert: blauer Punkt auf den Kopf und Loctite aufs Gewinde' }
    ] };

  Object.values(window.TEMPLATES).forEach(t => {
    const secs = t.phases.wls.sections;
    if (!secs.includes(START_SECTION)) secs.unshift(START_SECTION);
    if (!secs.includes(PREASSEMBLY_SECTION)) {
      const i = secs.findIndex(x => x.title === 'Vorbereitung');
      secs.splice(i >= 0 ? i + 1 : 1, 0, PREASSEMBLY_SECTION);
    }
  });
  window.flatItems = flatItems;
  window.summarizeDay = summarizeDay;
})();
