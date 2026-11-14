// En knapp som visar valt datum och öppnar telefonens egen datumväljare.
// Android och iPhone fungerar olika: Android öppnar en kalender-ruta,
// iPhone visar en kompakt väljare direkt på sidan.
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { färg, radie } from '../tema';

export default function Datumvaljare({ värde, onÄndra, min, max, platshållare, språkkod }) {
  // iPhone: visa väljaren direkt
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={värde || new Date()}
        mode="date"
        display="compact"
        minimumDate={min}
        maximumDate={max}
        accentColor={färg.primär}
        locale={språkkod} // iPhone: visa månadsnamn på appens språk
        onValueChange={(_, datum) => onÄndra(datum)}
        style={stilar.ios}
      />
    );
  }

  // Android: en knapp som öppnar kalender-rutan
  const öppna = () =>
    DateTimePickerAndroid.open({
      value: värde || new Date(),
      mode: 'date',
      minimumDate: min,
      maximumDate: max,
      onValueChange: (_, datum) => onÄndra(datum),
    });

  return (
    <Pressable style={stilar.knapp} onPress={öppna} accessibilityRole="button">
      <Text style={[stilar.text, !värde && stilar.platshållare]}>
        {värde ? värde.toLocaleDateString('sv-SE') : platshållare}
      </Text>
    </Pressable>
  );
}

const stilar = StyleSheet.create({
  ios: { alignSelf: 'flex-start' },
  knapp: {
    borderWidth: 1,
    borderColor: färg.kant,
    borderRadius: radie.liten,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: färg.yta,
  },
  text: { fontSize: 16, color: färg.text },
  platshållare: { color: färg.textSvag },
});
