// Netlify Function: liest ein Foto mit der Perplexity API und gibt strukturierte Daten zurück.
// Der API Schlüssel liegt nur in Netlify (Umgebungsvariable PERPLEXITY_API_KEY), nie in der Webseite.
// Optional: SCAN_CODE als einfacher Zugriffsschutz, PERPLEXITY_MODEL zum Ändern des Modells.

const PROMPTS = {
  fix: 'Du liest das Foto einer Rechnung, eines Vertrags, einer Abbuchung oder einer Tabelle mit monatlichen Ausgaben. ' +
    'Gib NUR ein JSON Objekt ohne weiteren Text zurück: {"items": [ {"name": ..., "amount": ..., "every": ..., "from": ...} ]}. ' +
    'Jede einzelne Ausgabenposition mit einem Betrag wird ein eigener Eintrag in items. ' +
    'name: kurzer Name der Position (zum Beispiel Strom, Handyvertrag, Haftpflicht). ' +
    'amount: Betrag pro Zahlung als Zahl in Euro mit Punkt als Dezimaltrenner. ' +
    'every: 1 für monatlich, 3 für vierteljährlich, 12 für jährlich. Bei einer Tabelle mit monatlichen Beträgen ist every immer 1. ' +
    'from: Monat des Beginns oder der Gültigkeit im Format JJJJ-MM oder null. ' +
    'Lass Summenzeilen, Einkünfte, Einnahmen, Überschriften und Zeilen ohne Betrag weg. ' +
    'Bei einer einzelnen Rechnung oder einem einzelnen Vertrag gibt es genau einen Eintrag. ' +
    'Wenn du einen Wert nicht sicher erkennst, setze null.',
  fixauto: 'Du liest das Foto oder den Screenshot zu Fixkosten. Es zeigt entweder einen einzelnen Beleg (Rechnung, Vertrag, Abbuchung, Versicherungsunterlage) oder eine Tabelle mit mehreren monatlichen Fixkosten. ' +
    'Gib NUR ein JSON Objekt ohne weiteren Text zurück: ' +
    '{"items": [{"name": kurzer Name des Postens (zum Beispiel Strom, Handyvertrag, Haftpflicht), ' +
    '"amount": Betrag pro Zahlung als Zahl in Euro mit Punkt als Dezimaltrenner, ' +
    '"every": 1 für monatlich, 3 für vierteljährlich, 12 für jährlich, ' +
    '"from": Monat des Beginns oder der Gültigkeit im Format JJJJ-MM oder null}]}. ' +
    'Bei einem einzelnen Beleg gibst du genau einen Eintrag zurück. Bei einer Tabelle gibst du eine Zeile pro Posten zurück und setzt every auf 1. ' +
    'Lasse Zeilen ohne Betrag, Überschriften und Summenzeilen wie SUMME DER AUSGABEN weg. ' +
    'Deutsche Schreibweise: 1.857 € bedeutet 1857 und 216,00 bedeutet 216. Wenn mehrere Betragsspalten sichtbar sind, nimm nur die erste. ' +
    'Wenn du einen Wert nicht sicher erkennst, setze null.',
  fixlist: 'Du liest das Foto oder den Screenshot einer Tabelle mit monatlichen Fixkosten, eine Zeile pro Posten. ' +
    'Gib NUR ein JSON Objekt ohne weiteren Text zurück: ' +
    '{"items": [{"name": Bezeichnung des Postens genau wie in der Zeile, "amount": Betrag pro Monat als Zahl in Euro mit Punkt als Dezimaltrenner}]}. ' +
    'Beachte die deutsche Schreibweise: 1.857 € bedeutet 1857 und 216,00 bedeutet 216. ' +
    'Lasse Zeilen ohne Betrag weg. Lasse Überschriften und Summenzeilen wie SUMME DER AUSGABEN oder SUMME DER EINKÜNFTE weg. ' +
    'Wenn mehrere Betragsspalten sichtbar sind, nimm nur die erste Betragsspalte.',
  beleg: 'Du liest das Foto oder den Screenshot eines Belegs. Das aktuelle Jahr ist ' + new Date().getFullYear() + '. ' +
    'Entscheide zuerst, was es ist: "bon" für einen Kassenbon oder eine Quittung, "auszug" für einen Kontoauszug oder eine Liste von Kontobuchungen. ' +
    'Gib NUR ein JSON Objekt ohne weiteren Text zurück: ' +
    '{"type": "bon" oder "auszug", "merchant": Name des Geschäfts oder null, "date": Datum des Belegs im Format JJJJ-MM-TT oder null, ' +
    '"total": Gesamtsumme des Bons als Zahl in Euro mit Punkt als Dezimaltrenner oder null, ' +
    '"items": [{"date": Buchungsdatum im Format JJJJ-MM-TT oder null, "name": Artikelbezeichnung bzw. Empfänger oder kurzer Verwendungszweck, ' +
    '"amount": Betrag als Zahl in Euro mit Punkt als Dezimaltrenner, ' +
    '"category": genau eine aus Lebensmittel, Wohnen, Mobilität, Freizeit, Shopping, Gesundheit, Abos, Sonstiges, Gehalt}]}. ' +
    'Bei einem Bon: eine Position pro Artikel, amount ist der positive Preis der Position. Lasse Summenzeilen, MwSt, Zahlungsart, Rückgeld, Rabattzeilen und Pfandrückgabe weg. ' +
    'Bei einem Auszug: eine Position pro Buchung, amount ist positiv für Eingänge und negativ für Abbuchungen. Lasse Kontostand, Summen, Überschriften und Zeilen ohne Betrag weg. ' +
    'Verwende die Kategorie Gehalt nur für einen Gehaltseingang. Deutsche Schreibweise: 1.234,56 bedeutet 1234.56.',
  bonlist: 'Du liest das Foto eines Kassenbons mit mehreren Positionen. ' +
    'Gib NUR ein JSON Objekt ohne weiteren Text zurück: ' +
    '{"merchant": Name des Geschäfts oder null, "date": Datum im Format JJJJ-MM-TT oder null, ' +
    '"total": Gesamtsumme des Bons als Zahl in Euro mit Punkt als Dezimaltrenner, ' +
    '"items": [{"name": Artikelbezeichnung wie auf dem Bon, "price": Preis dieser Position als Zahl in Euro (Menge mal Einzelpreis), ' +
    '"category": genau eine aus Lebensmittel, Wohnen, Mobilität, Freizeit, Shopping, Gesundheit, Abos, Sonstiges}]}. ' +
    'Lasse Summenzeilen, MwSt, Zahlungsart, Rückgeld, Rabattzeilen und Pfandrückgabe weg. ' +
    'Deutsche Schreibweise: 1.234,56 bedeutet 1234.56.',
  stmt: 'Du liest das Foto oder den Screenshot eines Kontoauszugs oder einer Liste von Kontobuchungen. Das aktuelle Jahr ist ' + new Date().getFullYear() + '. ' +
    'Gib NUR ein JSON Objekt ohne weiteren Text zurück: ' +
    '{"items": [{"date": Buchungsdatum im Format JJJJ-MM-TT oder null, "name": Empfänger oder kurzer Verwendungszweck, ' +
    '"amount": Betrag als Zahl in Euro mit Punkt als Dezimaltrenner, positiv für Eingänge und negativ für Abbuchungen, ' +
    '"category": genau eine aus Lebensmittel, Wohnen, Mobilität, Freizeit, Shopping, Gesundheit, Abos, Sonstiges, Gehalt}]}. ' +
    'Lasse Kontostand, Summen, Überschriften und Zeilen ohne Betrag weg. ' +
    'Deutsche Schreibweise: 1.234,56 bedeutet 1234.56. Verwende Gehalt nur für einen Gehaltseingang.',
  sal: 'Du liest das Foto einer Gehaltsabrechnung. ' +
    'Gib NUR ein JSON Objekt ohne weiteren Text zurück: ' +
    '{"net": Auszahlungsbetrag netto pro Monat als Zahl in Euro mit Punkt als Dezimaltrenner, ' +
    '"gross": Bruttogehalt pro Monat als Zahl oder null, ' +
    '"bonus": Sonderzahlung wie Weihnachtsgeld als Zahl oder null, ' +
    '"from": Abrechnungsmonat im Format JJJJ-MM oder null}. ' +
    'Wenn du einen Wert nicht sicher erkennst, setze null.',
  bon: 'Du liest das Foto eines Kassenbons oder einer Quittung. ' +
    'Gib NUR ein JSON Objekt ohne weiteren Text zurück: ' +
    '{"total": Gesamtbetrag als Zahl in Euro mit Punkt als Dezimaltrenner, ' +
    '"merchant": Name des Geschäfts, ' +
    '"date": Datum im Format JJJJ-MM-TT oder null, ' +
    '"category": genau eine aus Lebensmittel, Wohnen, Mobilität, Freizeit, Shopping, Gesundheit, Abos, Sonstiges}. ' +
    'Wenn du einen Wert nicht sicher erkennst, setze null.'
};

function reply(status, obj) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(obj)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Nur POST erlaubt.' });

  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return reply(500, { error: 'In Netlify ist noch kein PERPLEXITY_API_KEY hinterlegt.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return reply(400, { error: 'Ungültige Anfrage.' }); }

  const need = process.env.SCAN_CODE;
  if (need && body.code !== need) return reply(401, { error: 'Der Scan Code stimmt nicht.' });

  const prompt = PROMPTS[body.mode];
  if (!prompt) return reply(400, { error: 'Unbekannter Modus.' });

  const image = body.image;
  if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
    return reply(400, { error: 'Es wurde kein gültiges Bild gesendet.' });
  }
  if (image.length > 5000000) return reply(413, { error: 'Das Bild ist zu groß.' });

  try {
    const res = await fetch('https://api.perplexity.ai/v1/agent', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.PERPLEXITY_MODEL || 'openai/gpt-5.6-luna',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: image }
          ]
        }]
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (j && (j.error && (j.error.message || j.error))) || ('Perplexity Fehler ' + res.status);
      return reply(502, { error: String(msg) });
    }
    let text = j.output_text || '';
    if (!text && Array.isArray(j.output)) {
      text = j.output.map(o => (o.content || []).map(c => c.text || '').join('')).join('');
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return reply(502, { error: 'Aus dem Foto konnte nichts gelesen werden.' });
    let data;
    try { data = JSON.parse(m[0]); }
    catch (e) { return reply(502, { error: 'Die Antwort war nicht lesbar.' }); }
    return reply(200, { data });
  } catch (e) {
    return reply(502, { error: 'Die Verbindung zu Perplexity hat nicht geklappt.' });
  }
};
