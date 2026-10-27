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
