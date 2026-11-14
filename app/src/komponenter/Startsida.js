// Första skärmen: välj språk och (frivilligt) gravid / har barn / ammar, med födelsedatum eller beräknat förlossningsdatum.
// Samma skärm används senare som "Inställningar" när man trycker på kugghjulet.
import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Datumvaljare from './Datumvaljare';
import Svarstext from './Svarstext';
import { policyText } from '../integritetspolicy';
import { SPRÅK } from '../oversattningar';
import { texter } from '../texter';
import { frånIsoDatum, tillIsoDatum } from '../profil';
import { färg, radie } from '../tema';

const DAG = 24 * 60 * 60 * 1000;

export default function Startsida({ start, onSpara, onAvbryt }) {
  // Lokala val som sparas först när man trycker Fortsätt/Spara
  const [språk, setSpråk] = useState(start?.språk || 'Svenska');
  const [typ, setTyp] = useState(start?.profil?.typ || null);           // 'gravid' | 'barn' | 'ammar' | null
  // Datumet kan saknas (för 'ammar' är barnets födelsedatum frivilligt)
  const [datum, setDatum] = useState(start?.profil?.datum ? frånIsoDatum(start.profil.datum) : null);
  const [visaSpråklista, setVisaSpråklista] = useState(false);
  const [visaPolicy, setVisaPolicy] = useState(false);
  // Samtycke: redan givet om man öppnar inställningarna; annars måste rutan kryssas i
  const harSamtyckt = Boolean(start?.samtycke);
  const [samtycke, setSamtycke] = useState(harSamtyckt);

  const t = texter(språk);
  const idag = new Date();
  // Rimliga gränser: BF inom de närmaste 10 månaderna, födelsedatum inom de senaste 5 åren
  const gränser = typ === 'gravid'
    ? { min: idag, max: new Date(idag.getTime() + 300 * DAG) }
    : { min: new Date(idag.getTime() - 5 * 365 * DAG), max: idag };

  const väljTyp = (nyTyp) => {
    if (nyTyp === typ) return; // samma val igen: behåll datumet
    setTyp(nyTyp);
    setDatum(null); // nytt val = välj nytt datum
  };

  // Man får gå vidare när samtycket är givet, och man antingen hoppat över, valt "ammar"
  // (där datumet är frivilligt) eller valt ett datum
  const kanFortsätta = samtycke && (typ === null || typ === 'ammar' || datum !== null);

  // Profilen som sparas i telefonen. 'ammar' sparas även utan datum.
  let profil = null;
  if (typ === 'ammar') profil = datum ? { typ, datum: tillIsoDatum(datum) } : { typ };
  else if (typ && datum) profil = { typ, datum: tillIsoDatum(datum) };

  const spara = () =>
    onSpara({
      språk,
      profil,
      // Sparar att samtycke har getts, och vilken version av policyn det gällde
      samtycke: { version: 1 },
    });

  return (
    <SafeAreaView style={stilar.skärm} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={stilar.innehåll}>
        {onAvbryt && (
          <Pressable onPress={onAvbryt} style={stilar.stäng} accessibilityLabel={t.avbryt} hitSlop={12}>
            <Ionicons name="close" size={26} color={färg.text} />
          </Pressable>
        )}

        <Text style={stilar.rubrik}>{onAvbryt ? t.inställningar : t.välkommen}</Text>
        <Text style={stilar.underrubrik}>{t.underrubrik}</Text>

        {/* Språk */}
        <Text style={stilar.etikett}>{t.väljSpråk}</Text>
        <Pressable style={stilar.fält} onPress={() => setVisaSpråklista(true)} accessibilityRole="button">
          <Text style={stilar.fältText}>{språk}</Text>
          <Ionicons name="chevron-down" size={20} color={färg.textSvag} />
        </Pressable>

        {/* Vem frågar? */}
        <Text style={stilar.etikett}>{t.vemÄrDu}</Text>
        <Text style={stilar.info}>{t.vemÄrDuInfo}</Text>
        <Val ikon="heart-outline" text={t.gravid} vald={typ === 'gravid'} onPress={() => väljTyp('gravid')} />
        <Val ikon="happy-outline" text={t.harBarn} vald={typ === 'barn'} onPress={() => väljTyp('barn')} />
        <Val ikon="water-outline" text={t.ammar} vald={typ === 'ammar'} onPress={() => väljTyp('ammar')} />
        <Val ikon="arrow-forward-outline" text={t.hoppaÖver} vald={typ === null} onPress={() => väljTyp(null)} />

        {/* Datum – visas bara om man valt gravid, barn eller ammar (för ammar är det frivilligt) */}
        {typ && (
          <View style={stilar.datumRuta}>
            <Text style={stilar.etikett}>
              {typ === 'gravid' ? t.bfDatum : typ === 'ammar' ? t.födelsedatumFrivilligt : t.födelsedatum}
            </Text>
            <Datumvaljare
              värde={datum}
              onÄndra={setDatum}
              min={gränser.min}
              max={gränser.max}
              platshållare={t.väljDatum}
              språkkod={t.kod}
            />
          </View>
        )}

        <Text style={stilar.ansvar}>{t.ansvar}</Text>

        {/* Länk till integritetspolicyn – visas alltid */}
        <Pressable onPress={() => setVisaPolicy(true)} style={stilar.policyLänk} accessibilityRole="link">
          <Ionicons name="shield-checkmark-outline" size={18} color={färg.primär} />
          <Text style={stilar.policyLänkText}>{t.läsPolicy}</Text>
        </Pressable>

        {/* Samtyckesruta – bara första gången */}
        {!harSamtyckt && (
          <Pressable
            style={stilar.samtyckeRad}
            onPress={() => setSamtycke(!samtycke)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: samtycke }}
          >
            <Ionicons
              name={samtycke ? 'checkbox' : 'square-outline'}
              size={26}
              color={samtycke ? färg.primär : färg.textSvag}
            />
            <Text style={stilar.samtyckeText}>{t.samtycke}</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={stilar.fot}>
        <Pressable
          style={[stilar.huvudknapp, !kanFortsätta && stilar.avstängd]}
          onPress={spara}
          disabled={!kanFortsätta}
          accessibilityRole="button"
        >
          <Text style={stilar.huvudknappText}>{onAvbryt ? t.spara : t.fortsätt}</Text>
        </Pressable>
      </View>

      {/* Integritetspolicyn i en egen ruta */}
      <Modal visible={visaPolicy} animationType="slide" onRequestClose={() => setVisaPolicy(false)}>
        <SafeAreaView style={stilar.skärm}>
          <View style={stilar.listHuvud}>
            <Text style={stilar.listRubrik}>{t.policyRubrik}</Text>
            <Pressable onPress={() => setVisaPolicy(false)} hitSlop={12} accessibilityLabel={t.avbryt}>
              <Ionicons name="close" size={26} color={färg.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={stilar.innehåll}>
            {/* Policyn på valt språk, med knappnamnet "Ny chatt" på samma språk, och höger-till-vänster vid behov */}
            <Svarstext text={policyText(språk, t.nyChatt)} högerTillVänster={t.högerTillVänster} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Lista med alla 31 språk */}
      <Modal visible={visaSpråklista} animationType="slide" onRequestClose={() => setVisaSpråklista(false)}>
        <SafeAreaView style={stilar.skärm}>
          <View style={stilar.listHuvud}>
            <Text style={stilar.listRubrik}>{t.väljSpråk}</Text>
            <Pressable onPress={() => setVisaSpråklista(false)} hitSlop={12} accessibilityLabel={t.avbryt}>
              <Ionicons name="close" size={26} color={färg.text} />
            </Pressable>
          </View>
          <FlatList
            data={SPRÅK}
            keyExtractor={(s) => s}
            contentContainerStyle={stilar.listInnehåll}
            renderItem={({ item }) => (
              <Pressable
                style={[stilar.listRad, item === språk && stilar.listRadVald]}
                onPress={() => {
                  setSpråk(item);
                  setVisaSpråklista(false);
                }}
              >
                <Text style={stilar.fältText}>{item}</Text>
                {item === språk && <Ionicons name="checkmark" size={22} color={färg.primär} />}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// Ett valbart kort ("Jag är gravid" osv.)
function Val({ ikon, text, vald, onPress }) {
  return (
    <Pressable
      style={[stilar.val, vald && stilar.valValt]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: vald }}
    >
      <Ionicons name={ikon} size={22} color={vald ? färg.primär : färg.textSvag} />
      <Text style={[stilar.valText, vald && { color: färg.primär }]}>{text}</Text>
      {vald && <Ionicons name="checkmark-circle" size={22} color={färg.primär} />}
    </Pressable>
  );
}

const stilar = StyleSheet.create({
  skärm: { flex: 1, backgroundColor: färg.bakgrund },
  innehåll: { padding: 24, paddingBottom: 40 },
  stäng: { alignSelf: 'flex-end', marginBottom: 8 },
  rubrik: { fontSize: 30, fontWeight: '700', color: färg.text, marginTop: 12 },
  underrubrik: { fontSize: 16, lineHeight: 23, color: färg.textSvag, marginTop: 8 },
  etikett: { fontSize: 15, fontWeight: '600', color: färg.text, marginTop: 28, marginBottom: 8 },
  info: { fontSize: 14, lineHeight: 20, color: färg.textSvag, marginTop: -4, marginBottom: 12 },
  fält: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: färg.yta,
    borderWidth: 1,
    borderColor: färg.kant,
    borderRadius: radie.liten,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  fältText: { fontSize: 16, color: färg.text },
  val: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: färg.yta,
    borderWidth: 1.5,
    borderColor: färg.kant,
    borderRadius: radie.liten,
    padding: 16,
    marginBottom: 10,
  },
  valValt: { borderColor: färg.primär, backgroundColor: färg.primärLjus },
  valText: { flex: 1, fontSize: 16, fontWeight: '500', color: färg.text },
  datumRuta: { marginTop: -8 },
  policyLänk: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, paddingVertical: 6 },
  policyLänkText: { fontSize: 15, fontWeight: '600', color: färg.primär, textDecorationLine: 'underline' },
  samtyckeRad: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 12,
    padding: 14,
    backgroundColor: färg.yta,
    borderWidth: 1,
    borderColor: färg.kant,
    borderRadius: radie.liten,
  },
  samtyckeText: { flex: 1, fontSize: 15, lineHeight: 21, color: färg.text },
  ansvar: { fontSize: 13, lineHeight: 19, color: färg.textSvag, marginTop: 32 },
  fot: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8, backgroundColor: färg.bakgrund },
  huvudknapp: { backgroundColor: färg.primär, borderRadius: radie.stor, paddingVertical: 16, alignItems: 'center' },
  huvudknappText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  avstängd: { opacity: 0.4 },
  listHuvud: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: färg.kant,
  },
  listRubrik: { fontSize: 20, fontWeight: '700', color: färg.text },
  // Varje språk är en egen rundad ruta
  listRad: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 18,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: färg.yta,
    borderRadius: radie.liten,
  },
  listRadVald: { backgroundColor: färg.primärLjus },
  listInnehåll: { paddingTop: 12, paddingBottom: 24 },
});
