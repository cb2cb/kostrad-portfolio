// Appens färger och mått på ett ställe, så att allt ser enhetligt ut
export const färg = {
  bakgrund: '#F6F7F5',
  yta: '#FFFFFF',
  primär: '#2C7A5C',        // samma gröna som i Streamlit-appen
  primärLjus: '#E3F1EA',
  text: '#1F2A24',
  textSvag: '#5F6B64',
  kant: '#E2E6E3',
  varning: '#8A5A00',
  varningBakgrund: '#FFF6E0',
  fel: '#B3261E',
};

// Hörnens rundning: liten = rutor och knappar, stor = bubblor och paneler
export const radie = { liten: 14, stor: 22 };

// Mjuk skugga som får rutor att "lyfta" lite från bakgrunden.
// shadow* används av iPhone, elevation av Android.
export const skugga = {
  shadowColor: '#1F2A24',
  shadowOpacity: 0.07,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

// Ännu svagare skugga för t.ex. svarsbubblor
export const lättSkugga = {
  shadowColor: '#1F2A24',
  shadowOpacity: 0.05,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};
