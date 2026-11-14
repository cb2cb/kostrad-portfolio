# Testverktyg: visar vilka textstycken appen hittar för en fråga, och vad den svarar.
# Används bara för felsökning på din dator – påverkar inte appen eller servern.
#
# Kör så här (i chatbot-mappen):
#   python testa_sokning.py "Can I drink wine and coffee while breastfeeding?" English
#   python testa_sokning.py "Kan jag dricka vin och kaffe när jag ammar?"
import sys
import rag

def steg(text):
    # Skriver ut direkt (flush), så att man ser var skriptet är om det fastnar
    print(f"... {text}", flush=True)

fråga = sys.argv[1]                                     # frågan, inom citattecken
språk = sys.argv[2] if len(sys.argv) > 2 else "Svenska" # valt språk i appen (standard: svenska)

steg("laddar kunskapsbasen")
kb = rag.Kunskapsbas()                                  # laddar källorna och embeddings.pkl

steg("delar upp frågan")
print("Delfrågor (enkel regel):", rag.dela_upp_fråga(fråga) or "(bara en del)")
if språk != "Svenska":
    steg("översätter till svenska")
    svensk, delar = kb._till_svenska(fråga)
    print(f"På svenska: {svensk}\nDelfrågor från Gemini: {delar or '(inga)'}")

steg("söker")
print(f"\nGräns för att räknas som relevant: {rag.MIN_LIKHET}\n")
for nr, t in enumerate(kb.sökträffar(fråga, [], språk), start=1):
    med = "MED " if t["likhet"] >= rag.MIN_LIKHET else "utan"
    print(f"{nr:2}. [{med}] likhet {t['likhet']:.3f} | {t['källa']}, sida {t['sida']}")
    print(f"      {t['text'][:160]}...")

# Visa också hela svaret, precis som appen skulle få det
# (med profilen "ammar, barnet 3 månader" och ingen tidigare chatt)
steg("frågar Gemini (tar några sekunder)")
print("\n--- SVAR (profil: ammar, barn 3 månader, ny chatt) ---")
resultat = kb.svara(fråga, historik=[], språk=språk, profil={"typ": "ammar", "månader": 3})
print(resultat["svar"])
print("\nKällor:", ", ".join(resultat["källor"]))
