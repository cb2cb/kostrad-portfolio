// Visar chatbotens svar snyggt.
// Gemini skriver enkel "markdown": **fetstil**, punktlistor med * eller -, och tomma rader
// mellan stycken. Här gör vi om det till riktig text i appen.
// All text är markerbar (selectable): håll fingret på texten för att markera och kopiera en del av den.
import { StyleSheet, Text, View } from 'react-native';
import { färg } from '../tema';

// Delar upp en rad i vanlig text och **fetstil**
function MedFetstil({ text, stil }) {
  const delar = text.split(/(\*\*[^*]+\*\*)/g); // behåller **...** som egna delar
  return (
    <Text style={stil} selectable>
      {delar.map((del, i) =>
        del.startsWith('**') && del.endsWith('**') ? (
          <Text key={i} style={stilar.fet}>{del.slice(2, -2)}</Text>
        ) : (
          del
        )
      )}
    </Text>
  );
}

export default function Svarstext({ text, högerTillVänster }) {
  const riktning = högerTillVänster ? { textAlign: 'right', writingDirection: 'rtl' } : null;
  const rader = text.split('\n');

  return (
    <View>
      {rader.map((rad, i) => {
        const r = rad.trim();
        if (!r) return <View key={i} style={stilar.mellanrum} />;      // tom rad = nytt stycke

        const punkt = r.match(/^[*\-•]\s+(.*)/);                         // punktlista
        if (punkt) {
          return (
            <View key={i} style={[stilar.punktRad, högerTillVänster && { flexDirection: 'row-reverse' }]}>
              <Text style={stilar.punkt}>•</Text>
              <MedFetstil text={punkt[1]} stil={[stilar.text, stilar.punktText, riktning]} />
            </View>
          );
        }

        const rubrik = r.match(/^#+\s+(.*)/);                            // ### Rubrik
        if (rubrik) return <MedFetstil key={i} text={rubrik[1]} stil={[stilar.text, stilar.fet, riktning]} />;

        return <MedFetstil key={i} text={r} stil={[stilar.text, riktning]} />;
      })}
    </View>
  );
}

const stilar = StyleSheet.create({
  text: { fontSize: 16, lineHeight: 23, color: färg.text },
  fet: { fontWeight: '700' },
  mellanrum: { height: 8 },
  punktRad: { flexDirection: 'row', marginVertical: 2 },
  punkt: { fontSize: 16, lineHeight: 23, color: färg.primär, width: 18, textAlign: 'center' },
  punktText: { flex: 1 },
});
