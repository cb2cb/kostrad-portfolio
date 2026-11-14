// Alla texter i appens gränssnitt, på alla 31 språk.
// Knappar och rubriker finns i ui_texter.json. Titel, underrubrik, platshållare och
// ansvarsfriskrivning finns i oversattningar.js (samma texter som i Streamlit-appen).
import UI from './ui_texter.json';
import { TITLAR, UNDERRUBRIKER, PLACEHOLDER_TEXTER, DISCLAIMERS } from './oversattningar';

// Språk som skrivs från höger till vänster
const HÖGER_TILL_VÄNSTER = ['العربية', 'فارسی', 'دری', 'ܐܪܡܝܐ'];

// Fyller i {v}, {n} osv. i en text, t.ex. "Gravid v. {v}+{d}" -> "Gravid v. 30+2"
function fyllI(mall, värden) {
  return mall.replace(/\{(\w+)\}/g, (_, namn) => String(värden[namn] ?? ''));
}

// Returnerar alla texter för ett språk. Saknas språket används svenska.
export function texter(språk) {
  const ui = UI[språk] || UI.Svenska;
  return {
    ...ui,
    // Texter med siffror i är små funktioner, så att siffrorna hamnar rätt på varje språk
    gravidVecka: (v, d) => fyllI(ui.gravidVecka, { v, d }),
    barnÅlder: (text) => fyllI(ui.barnÅlder, { text }),
    ammarBarn: (text) => fyllI(ui.ammarBarn, { text }),
    veckor: (n) => fyllI(ui.veckor, { n }),
    månader: (n) => fyllI(ui.månader, { n }),
    år: (å, m) => (m ? fyllI(ui.årMån, { å, m }) : fyllI(ui.år, { å })),
    titel: TITLAR[språk] || TITLAR.Svenska,
    underrubrik: UNDERRUBRIKER[språk] || UNDERRUBRIKER.Svenska,
    platshållare: PLACEHOLDER_TEXTER[språk] || PLACEHOLDER_TEXTER.Svenska,
    ansvar: DISCLAIMERS[språk] || DISCLAIMERS.Svenska,
    högerTillVänster: HÖGER_TILL_VÄNSTER.includes(språk),
  };
}
