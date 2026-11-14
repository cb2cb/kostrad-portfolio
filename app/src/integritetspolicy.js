// Integritetspolicyn. Texterna på alla 31 språk finns i integritetspolicy.json.
// UTKAST – läs igenom och låt gärna någon kunnig granska den innan appen släpps.
// Översättningarna till arameiska, tigrinja, kurdiska, somaliska och dari bör granskas
// av någon som har språket som modersmål.
import POLICY from './integritetspolicy.json';

// ===== Fyll i här – det gäller automatiskt alla språk =====
const SENAST_UPPDATERAD = '2026-11-01';         // ändra när texten i policyn ändras
const KONTAKT_EPOST = 'kostradcontact@gmail.com'; // byt till bolagets adress när det finns
// =========================================================

// Returnerar policyn på valt språk (svenska om språket saknas).
// nyChattText är knappens namn på samma språk, så att texten stämmer med appen.
export function policyText(språk, nyChattText) {
  const mall = POLICY[språk] || POLICY.Svenska;
  return mall
    .replace('{DATUM}', SENAST_UPPDATERAD)
    .replace('{EPOST}', KONTAKT_EPOST)
    .replace('{NY_CHATT}', nyChattText || '');
}
