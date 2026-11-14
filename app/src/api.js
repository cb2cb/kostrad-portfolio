// Pratar med servern (api.py).
// expo/fetch används i stället för vanliga fetch, eftersom den kan läsa svaret
// medan det kommer in – det är det som gör att texten syns ord för ord.
import { fetch } from 'expo/fetch';

// Serverns adress. Sätts i filen app/.env (EXPO_PUBLIC_API_URL=http://192.168.x.x:8000).
// Mobilen och datorn måste vara på samma wifi när du testar.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Hemlig nyckel som visar för servern att anropet kommer från appen (sätts i app/.env).
// Saknas den skickas ingen nyckel – det fungerar mot en olåst server när du testar lokalt.
const APP_NYCKEL = process.env.EXPO_PUBLIC_APP_NYCKEL;

/**
 * Skickar en fråga och tar emot svaret i bitar.
 *   onKällor(lista) – anropas en gång med källorna svaret bygger på
 *   onText(bit)     – anropas för varje ny textbit
 * Kastar ett fel om något går snett, så att appen kan visa ett felmeddelande.
 */
export async function frågaStröm({ fråga, historik, språk, profil }, { onKällor, onText }) {
  const svar = await fetch(`${API_URL}/fraga/strom`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(APP_NYCKEL ? { 'X-App-Nyckel': APP_NYCKEL } : {}), // lägg bara till nyckeln om den finns
    },
    body: JSON.stringify({ fråga, historik, språk, profil }),
  });
  if (!svar.ok) throw new Error(`Servern svarade ${svar.status}`);

  const läsare = svar.body.getReader();
  const avkodare = new TextDecoder();
  let buffert = ''; // text som kommit in men ännu inte blivit en hel rad
  let klar = false; // blir true när servern säger att svaret är färdigt

  while (true) {
    const { done, value } = await läsare.read();
    if (done) break;
    buffert += avkodare.decode(value, { stream: true });

    // Servern skickar en JSON-rad per händelse. Hantera alla hela rader vi har fått.
    const rader = buffert.split('\n');
    buffert = rader.pop(); // sista biten kan vara en halv rad – spara den till nästa varv
    for (const rad of rader) {
      if (!rad.trim()) continue;
      const händelse = JSON.parse(rad);
      if (händelse.typ === 'källor') onKällor(händelse.data);
      else if (händelse.typ === 'text') onText(händelse.data);
      else if (händelse.typ === 'klar') klar = true;
      else if (händelse.typ === 'fel') throw new Error(händelse.data);
    }
  }
  // Bröts anslutningen mitt i svaret får användaren ett felmeddelande i stället för ett halvt råd
  if (!klar) throw new Error('Svaret avbröts');
}

/**
 * Skickar en rapport om ett felaktigt eller olämpligt svar till servern.
 * Google Play kräver att appar med AI-svar har en sådan funktion inne i appen.
 * Kastar ett fel om det inte gick, så att appen kan visa ett felmeddelande.
 */
export async function rapporteraSvar({ fråga, svar, språk }) {
  const res = await fetch(`${API_URL}/rapportera`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(APP_NYCKEL ? { 'X-App-Nyckel': APP_NYCKEL } : {}),
    },
    // Långa texter kortas av, så att rapporten alltid ryms (servern tar max 2000/8000 tecken)
    body: JSON.stringify({ fråga: (fråga || '').slice(0, 2000), svar: svar.slice(0, 8000), språk }),
  });
  if (!res.ok) throw new Error(`Servern svarade ${res.status}`);
}
