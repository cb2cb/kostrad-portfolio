// Appens startpunkt. Bestämmer vilken skärm som visas:
//  - Startsidan första gången (välj språk och ålder)
//  - Chatten när inställningarna är sparade
//  - Inställningar (samma skärm som startsidan, som en ruta ovanpå chatten) när man trycker på kugghjulet
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Startsida from './src/komponenter/Startsida';
import Chatt from './src/komponenter/Chatt';
import { färg } from './src/tema';

const NYCKEL = 'kostrad-installningar'; // namnet som inställningarna sparas under i telefonen

export default function App() {
  const [laddar, setLaddar] = useState(true);
  const [inställningar, setInställningar] = useState(null); // { språk, profil } eller null
  const [visaInställningar, setVisaInställningar] = useState(false);

  // Läs sparade inställningar när appen startar
  useEffect(() => {
    AsyncStorage.getItem(NYCKEL)
      .then((text) => text && setInställningar(JSON.parse(text)))
      .catch(() => {}) // går det inte att läsa visas startsidan igen, inget farligt
      .finally(() => setLaddar(false));
  }, []);

  // Spara nya inställningar både i appen och i telefonens minne
  const spara = (nya) => {
    setInställningar(nya);
    setVisaInställningar(false);
    AsyncStorage.setItem(NYCKEL, JSON.stringify(nya)).catch(() => {});
  };

  let skärm;
  if (laddar) {
    skärm = (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: färg.bakgrund }}>
        <ActivityIndicator color={färg.primär} />
      </View>
    );
  } else if (!inställningar || !inställningar.samtycke) {
    // Första gången, eller om samtycke saknas: visa startsidan (med tidigare val ifyllda)
    skärm = <Startsida start={inställningar} onSpara={spara} />;
  } else {
    // Chatten ligger kvar under inställningarna, så att konversationen inte försvinner
    skärm = (
      <>
        <Chatt inställningar={inställningar} onÖppnaInställningar={() => setVisaInställningar(true)} />
        <Modal visible={visaInställningar} animationType="slide" onRequestClose={() => setVisaInställningar(false)}>
          <SafeAreaProvider>
            <Startsida start={inställningar} onSpara={spara} onAvbryt={() => setVisaInställningar(false)} />
          </SafeAreaProvider>
        </Modal>
      </>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {skärm}
    </SafeAreaProvider>
  );
}
