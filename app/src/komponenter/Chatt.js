// Själva chatten: rubrik högst upp, meddelanden i mitten, skrivfält längst ner.
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Svarstext from './Svarstext';
import { frågaStröm, rapporteraSvar } from '../api';
import { profilEtikett, profilFörServer } from '../profil';
import { texter } from '../texter';
import { färg, lättSkugga, radie, skugga } from '../tema';

const CHATT_NYCKEL = 'kostrad-chatt'; // namnet som den pågående chatten sparas under i mobilen

// Öppnar telefonens dela-meny med hela svaret, där man kan välja "Kopiera"
// (eller skicka det i t.ex. sms eller mejl). **fetstil**-tecknen tas bort först.
function delaSvar(text) {
  Share.share({ message: text.replace(/\*\*/g, '') }).catch(() => {});
}

export default function Chatt({ inställningar, onÖppnaInställningar }) {
  const { språk, profil } = inställningar;
  const t = texter(språk);

  // meddelanden: [{ role: 'user' | 'assistant', content: '...', fel?: true }]
  const [meddelanden, setMeddelanden] = useState([]);
  const [fråga, setFråga] = useState('');
  const [väntar, setVäntar] = useState(false);   // true medan ett svar hämtas
  const lista = useRef(null);
  const [inläst, setInläst] = useState(false);  // true när en sparad chatt har lästs in

  // När chatten öppnas: hämta den sparade konversationen från mobilen
  useEffect(() => {
    AsyncStorage.getItem(CHATT_NYCKEL)
      .then((text) => text && setMeddelanden(JSON.parse(text)))
      .catch(() => {})                       // går det inte att läsa börjar man med en tom chatt
      .finally(() => setInläst(true));
  }, []);

  // Spara konversationen varje gång ett svar är klart (inte under tiden texten strömmar in).
  // Felmeddelanden och tomma svar sparas inte.
  useEffect(() => {
    if (!inläst || väntar) return;
    const attSpara = meddelanden.filter((m) => !m.fel && m.content);
    AsyncStorage.setItem(CHATT_NYCKEL, JSON.stringify(attSpara)).catch(() => {});
  }, [meddelanden, väntar, inläst]);

  // Ändra innehållet i det sista meddelandet (det svar som håller på att skrivas)
  const uppdateraSista = (ändring) =>
    setMeddelanden((gamla) => {
      const kopia = [...gamla];
      kopia[kopia.length - 1] = ändring(kopia[kopia.length - 1]);
      return kopia;
    });

  const skicka = async () => {
    const text = fråga.trim();
    if (!text || väntar) return;

    // Historiken som skickas till servern: tidigare lyckade meddelanden, utan felmeddelanden
    const historik = meddelanden.filter((m) => !m.fel).map(({ role, content }) => ({ role, content }));

    // Visa frågan direkt, plus en tom svarsbubbla som fylls på efterhand
    setMeddelanden((gamla) => [...gamla, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setFråga('');
    setVäntar(true);
    Keyboard.dismiss(); // stäng tangentbordet, så att svaret syns på hela skärmen

    try {
      await frågaStröm(
        // Bara åldern/veckan skickas – födelsedatumet stannar i mobilen
        { fråga: text, historik, språk, profil: profilFörServer(profil) },
        {
          onKällor: () => {},
          onText: (bit) => uppdateraSista((m) => ({ ...m, content: m.content + bit })),
        }
      );
      // Gemini kan avsluta utan text (t.ex. om ett filter stoppar svaret) – visa då ett fel i stället för en evig snurra
      uppdateraSista((m) => (m.content ? m : { ...m, content: t.fel, fel: true }));
    } catch (e) {
      console.warn(e);
      uppdateraSista((m) => ({ ...m, content: t.fel, fel: true }));
    } finally {
      setVäntar(false);
    }
  };

  // Fråga först, så att man inte råkar radera konversationen av misstag
  const nyKonversation = () => {
    if (väntar || meddelanden.length === 0) return;
    Alert.alert(t.nyChattFråga, t.nyChattInfo, [
      { text: t.avbryt, style: 'cancel' },
      { text: t.nyChatt, style: 'destructive', onPress: () => setMeddelanden([]) },
    ]);
  };

  // Rapportera svar nummer i: fråga först, skicka sedan frågan + svaret till servern
  const rapportera = (i) => {
    const svar = meddelanden[i]?.content || '';
    const fråga = meddelanden[i - 1]?.role === 'user' ? meddelanden[i - 1].content : '';
    Alert.alert(t.rapporteraRubrik, t.rapporteraInfo, [
      { text: t.avbryt, style: 'cancel' },
      {
        text: t.rapportera,
        onPress: () =>
          rapporteraSvar({ fråga, svar, språk })
            .then(() => Alert.alert(t.rapportTack))
            .catch(() => Alert.alert(t.fel)),
      },
    ]);
  };

  return (
    <SafeAreaView style={stilar.skärm} edges={['top', 'bottom']}>
      {/* Rubrikrad: tre rader – namn + Ny chatt, undertitel, profil + Ändra */}
      <View style={stilar.huvud}>
        <View style={stilar.huvudRad}>
          <Text style={stilar.appnamn}>Kostråd</Text>
          {/* Ny chatt – med text, så att man inte behöver gissa vad knappen gör */}
          <Pressable
            onPress={nyKonversation}
            style={[stilar.nyChattKnapp, meddelanden.length === 0 && stilar.avstängd]}
            disabled={meddelanden.length === 0 || väntar}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color={färg.text} />
            <Text style={stilar.nyChattText}>{t.nyChatt}</Text>
          </Pressable>
        </View>
        {/* Kort beskrivning på valt språk, över hela bredden (högst två rader) */}
        <Text style={[stilar.undertitel, t.högerTillVänster && { textAlign: 'right' }]} numberOfLines={2}>
          {t.undertitel}
        </Text>
        {/* Profilen + en tydlig "Ändra"-knapp som öppnar språk och ålder */}
        <Pressable onPress={onÖppnaInställningar} style={stilar.profilKnapp} hitSlop={6} accessibilityRole="button">
          <Text style={stilar.profilKnappText}>{profilEtikett(profil, t)}</Text>
          <View style={stilar.ändraDel}>
            <Ionicons name="pencil" size={13} color={färg.primär} />
            <Text style={stilar.ändraText}>{t.ändra}</Text>
          </View>
        </Pressable>
      </View>

      {/* Skjuter upp skrivfältet när tangentbordet visas. På nyare Android-versioner ritas appen
          ända ut till skärmkanten ("edge-to-edge"), och då krympar inte skärmen av sig själv när
          tangentbordet kommer upp – därför behövs 'padding' på både iPhone och Android. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          ref={lista}
          contentContainerStyle={stilar.meddelanden}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag" // tangentbordet stängs också när man drar i chatten
          // Rulla automatiskt ner när nya ord kommer in
          onContentSizeChange={() => lista.current?.scrollToEnd({ animated: true })}
        >
          {meddelanden.length === 0 ? (
            <View style={stilar.tomt}>
              <View style={stilar.tomtIkon}>
                <Ionicons name="nutrition-outline" size={34} color={färg.primär} />
              </View>
              <Text style={stilar.tomtRubrik}>{t.titel}</Text>
              {/* Talar om var svaren kommer ifrån (Livsmedelsverket och 1177), på valt språk */}
              <Text style={stilar.källText}>{t.underrubrik}</Text>
              <Text style={stilar.tomtText}>{t.tomtLäge}</Text>
              <View style={stilar.ansvarRuta}>
                <Ionicons name="information-circle-outline" size={18} color={färg.varning} />
                <Text style={stilar.ansvarText}>{t.ansvar}</Text>
              </View>
            </View>
          ) : (
            meddelanden.map((m, i) =>
              m.role === 'user' ? (
                <View key={i} style={[stilar.bubbla, stilar.användare]}>
                  <Text style={stilar.användarText} selectable>{m.content}</Text>
                </View>
              ) : (
                <View key={i} style={[stilar.bubbla, stilar.bot, m.fel && stilar.felBubbla]}>
                  {m.content === '' ? (
                    <ActivityIndicator color={färg.primär} style={{ alignSelf: 'flex-start' }} />
                  ) : m.fel ? (
                    <Text style={stilar.felText}>{m.content}</Text>
                  ) : (
                    <>
                      <Svarstext text={m.content} högerTillVänster={t.högerTillVänster} />
                      {/* Knappar under svaret – visas när svaret är färdigskrivet */}
                      {!(väntar && i === meddelanden.length - 1) && (
                        <View style={stilar.svarsKnappar}>
                          {/* Rapportera ett felaktigt/olämpligt svar (krav från Google Play) */}
                          <Pressable
                            onPress={() => rapportera(i)}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel={t.rapportera}
                          >
                            <Ionicons name="flag-outline" size={18} color={färg.textSvag} />
                          </Pressable>
                          {/* Kopiera eller dela svaret */}
                          <Pressable
                            onPress={() => delaSvar(m.content)}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel="Kopiera eller dela svaret"
                          >
                            <Ionicons name="copy-outline" size={18} color={färg.textSvag} />
                          </Pressable>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )
            )
          )}
        </ScrollView>

        {/* Skrivfält */}
        <View style={stilar.skrivrad}>
          <TextInput
            style={[stilar.fält, t.högerTillVänster && { textAlign: 'right' }]}
            value={fråga}
            onChangeText={setFråga}
            placeholder={t.platshållare}
            placeholderTextColor={färg.textSvag}
            multiline
            maxLength={800}
          />
          <Pressable
            style={[stilar.skicka, (!fråga.trim() || väntar) && stilar.avstängd]}
            onPress={skicka}
            disabled={!fråga.trim() || väntar}
            accessibilityLabel={t.skicka}
          >
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const stilar = StyleSheet.create({
  skärm: { flex: 1, backgroundColor: färg.bakgrund },
  huvud: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: färg.yta,
    // Rundade nedre hörn och mjuk skugga i stället för en rak linje
    borderBottomLeftRadius: radie.stor,
    borderBottomRightRadius: radie.stor,
    ...skugga,
    zIndex: 1, // skuggan ska synas ovanpå chatten
  },
  huvudRad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appnamn: { fontSize: 20, fontWeight: '700', color: färg.text },
  undertitel: { fontSize: 13, lineHeight: 18, color: färg.textSvag, marginTop: 2 },
  profilKnapp: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: färg.primärLjus,
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    marginTop: 6,
  },
  profilKnappText: { fontSize: 14, fontWeight: '600', color: färg.primär, marginRight: 8 },
  ändraDel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: färg.yta,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  ändraText: { fontSize: 13, fontWeight: '600', color: färg.primär },
  nyChattKnapp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: färg.kant,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 8,
  },
  nyChattText: { fontSize: 14, fontWeight: '600', color: färg.text },
  meddelanden: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  tomt: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  tomtIkon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: färg.primärLjus,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  tomtRubrik: { fontSize: 20, fontWeight: '700', color: färg.text, textAlign: 'center' },
  tomtText: { fontSize: 15, lineHeight: 22, color: färg.textSvag, textAlign: 'center', marginTop: 8 },
  källText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: färg.primär, textAlign: 'center', marginTop: 10 },
  ansvarRuta: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: färg.varningBakgrund,
    borderRadius: radie.liten,
    padding: 12,
    marginTop: 24,
  },
  ansvarText: { flex: 1, fontSize: 13, lineHeight: 19, color: färg.varning },
  bubbla: { borderRadius: radie.stor, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12, maxWidth: '88%' },
  användare: { alignSelf: 'flex-end', backgroundColor: färg.primär, borderBottomRightRadius: 8 },
  användarText: { color: '#fff', fontSize: 16, lineHeight: 22 },
  bot: {
    alignSelf: 'flex-start',
    backgroundColor: färg.yta,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: färg.kant,
    borderBottomLeftRadius: 8,
    ...lättSkugga,
  },
  felBubbla: { borderColor: färg.fel },
  svarsKnappar: { flexDirection: 'row', alignSelf: 'flex-end', gap: 20, marginTop: 10 },
  felText: { color: färg.fel, fontSize: 15, lineHeight: 21 },
  skrivrad: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: färg.yta,
    // Rundade övre hörn och mjuk skugga i stället för en rak linje
    borderTopLeftRadius: radie.stor,
    borderTopRightRadius: radie.stor,
    ...skugga,
    shadowOffset: { width: 0, height: -4 }, // skuggan uppåt, mot chatten
  },
  fält: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: färg.bakgrund,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
    color: färg.text,
  },
  skicka: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: färg.primär,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avstängd: { opacity: 0.35 },
});
