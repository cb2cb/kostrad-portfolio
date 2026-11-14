// Hjälpfunktioner för profilen (barnets ålder, graviditetsvecka eller att man ammar).
// I mobilen sparas profilen som { typ: 'barn' | 'gravid' | 'ammar', datum: 'ÅÅÅÅ-MM-DD' },
// så att åldern stämmer även om en månad. För 'ammar' är datumet (barnets födelsedag) frivilligt. Datumet lämnar ALDRIG mobilen –
// servern får bara den uträknade åldern eller veckan (se profilFörServer).

const DAG_MS = 24 * 60 * 60 * 1000;

// Gör om ett Date-objekt till texten 'ÅÅÅÅ-MM-DD'
export function tillIsoDatum(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Gör om 'ÅÅÅÅ-MM-DD' till ett Date-objekt (lokal tid, inte UTC)
export function frånIsoDatum(text) {
  const [å, m, d] = text.split('-').map(Number);
  return new Date(å, m - 1, d);
}

// Räknar ut ålder eller graviditetsvecka från det sparade datumet.
// Returnerar t.ex. { typ: 'barn', månader: 7 }, { typ: 'gravid', vecka: 25, dag: 1 },
// { typ: 'ammar', månader: 4 } eller { typ: 'ammar' } (om barnets födelsedatum inte angetts).
export function beräknaÅlder(profil, nu = new Date()) {
  if (!profil) return null;
  // Ammar utan datum: servern får bara veta att man ammar
  if (profil.typ === 'ammar' && !profil.datum) return { typ: 'ammar' };
  if (!profil.datum) return null; // skydd: trasig/ofullständig sparad profil
  // Räkna från midnatt idag, annars kan klockslaget göra att det blir en dag fel
  const idag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  const datum = frånIsoDatum(profil.datum);

  if (profil.typ === 'gravid') {
    // En graviditet räknas som 280 dagar (40 veckor) fram till beräknat datum
    const dagarKvar = Math.round((datum - idag) / DAG_MS);
    const dagarGravid = Math.min(Math.max(280 - dagarKvar, 0), 300);
    return { typ: 'gravid', vecka: Math.floor(dagarGravid / 7), dag: dagarGravid % 7 };
  }

  // Barn (eller ammar med barnets födelsedatum): räkna hela månader sedan födseln
  const typ = profil.typ === 'ammar' ? 'ammar' : 'barn';
  let månader = (idag.getFullYear() - datum.getFullYear()) * 12 + (idag.getMonth() - datum.getMonth());
  if (idag.getDate() < datum.getDate()) månader -= 1;
  månader = Math.min(Math.max(månader, 0), 60);
  if (månader === 0) {
    // Under en månad: räkna i veckor i stället
    return { typ, månader: 0, veckor: Math.min(Math.floor((idag - datum) / DAG_MS / 7), 5) };
  }
  return { typ, månader };
}

// Det som skickas till servern: bara ålder/vecka, aldrig datum
export function profilFörServer(profil) {
  return beräknaÅlder(profil);
}

// Kort etikett som visas högst upp i chatten, t.ex. "Barn 7 mån", "Gravid v. 25+1" eller "Ammar · barn 4 mån"
export function profilEtikett(profil, t) {
  const å = beräknaÅlder(profil);
  if (!å) return t.ingenProfil;
  if (å.typ === 'gravid') return t.gravidVecka(å.vecka, å.dag);
  if (å.typ === 'ammar' && å.månader === undefined) return t.ammarEtikett;

  // Barnets ålder som kort text: "3 v.", "7 mån" eller "1 år 2 mån"
  let ålder;
  if (å.månader === 0) ålder = t.veckor(å.veckor);
  else if (å.månader < 24) ålder = t.månader(å.månader);
  else ålder = t.år(Math.floor(å.månader / 12), å.månader % 12);

  return å.typ === 'ammar' ? t.ammarBarn(ålder) : t.barnÅlder(ålder);
}
