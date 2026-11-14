"""
rag.py – gemensam RAG-logik för kostrådschattboten.

All kod för att läsa PDF:er, dela upp texten i chunkar, skapa embeddings,
söka och bygga prompten finns HÄR, på ett enda ställe. Streamlit-appen,
api.py och evaluering.ipynb importerar alla denna fil, så en ändring här
gäller automatiskt överallt och de tre kan inte glida isär.
"""

import os
import re
import json
import time
import pickle
import hashlib

import numpy as np
from google import genai
from google.genai import types
from pypdf import PdfReader
from dotenv import load_dotenv

# Läs in GENAI_API_KEY från .env-filen
load_dotenv()

# ---------------------------------------------------------------
# Inställningar – samlade här så de är lätta att hitta och ändra
# ---------------------------------------------------------------
# Mappen där rag.py ligger. Alla filer letas upp relativt till den,
# så det spelar ingen roll vilken mapp man startar appen från.
MAPP = os.path.dirname(os.path.abspath(__file__))

EMBEDDING_MODELL = "models/gemini-embedding-2-preview"
CHATT_MODELL = "gemini-2.5-flash"
EMBEDDINGS_FIL = os.path.join(MAPP, "embeddings.pkl")
# PDF:erna ligger i undermappar här, t.ex. kallor/gravida, kallor/barn och kallor/ammande.
# Alla undermappar söks igenom, så nya mappar hittas automatiskt.
KÄLLMAPP = os.path.join(MAPP, "kallor")

# Öka med 1 om du ändrar HUR texten delas upp i skapa_chunks(), så skapas nya embeddings
CHUNK_VERSION = 1
MAX_CHUNK_STORLEK = 1000   # max antal tecken per chunk
OVERLAP = 150              # ungefär så många tecken av slutet på förra chunken följer med in i nästa
TOP_K = 6                  # hur många chunkar som hämtas för hela frågan
TOP_K_PER_DEL = 3          # frågor med flera delar ("vin och kaffe"): så många extra chunkar per del
GARANTERAT_PER_DEL = 2     # så många av varje dels bästa chunkar kommer ALLTID med
MAX_CHUNKAR = 12           # högst så många chunkar skickas till Gemini totalt

# Lägsta cosine similarity för att en chunk ska räknas som relevant.
# Ligger den bästa träffen under detta värde svarar botten att den inte vet
# i stället för att låta Gemini gissa. Värdet är en startgissning: kör
# kalibreringscellen i evaluering.ipynb och justera efter dina egna siffror.
MIN_LIKHET = 0.50

# Hur mycket Gemini får "tänka" innan den svarar (antal tokens).
#    0 = inget tänkande (snabbast)
#   -1 = Gemini bestämmer själv (långsammast, så som det var från början)
# Ett kort tänkande hjälper Gemini att kontrollera vilka delar av frågan källorna
# faktiskt svarar på, och att kombinera flera textstycken. Det kostar någon sekund extra.
TANKEBUDGET = 1024
GENERERINGS_CONFIG = types.GenerateContentConfig(
    thinking_config=types.ThinkingConfig(thinking_budget=TANKEBUDGET)
)

# Källorna är på svenska. En fråga på t.ex. engelska eller spanska ger lägre likhet
# mot den svenska texten och kan hamna under MIN_LIKHET fast svaret finns.
# Därför översätts frågan till svenska innan sökningen (bara om språket inte är svenska).
# Snabb inställning: inget tänkande, så översättningen tar bara en bråkdel av en sekund.
ÖVERSÄTT_CONFIG = types.GenerateContentConfig(
    thinking_config=types.ThinkingConfig(thinking_budget=0),
    temperature=0,
)

# Hur många tidigare meddelanden som skickas med i prompten (begränsar kostnaden)
MAX_HISTORIK = 10

# Källfilerna och deras läsbara namn. Namnet är det som botten ser och
# anger som källa i sina svar – filnamnet visas aldrig för användaren.
# Det spelar ingen roll i vilken undermapp till kallor/ en fil ligger.
# En PDF som saknas här tas ändå med, med ett namn som skapas från filnamnet.
KÄLLOR = {
    "bra-mat-for-spadbarn-under-ett-ar-livsmedelsverket.pdf": "Livsmedelsverket – Bra mat för spädbarn under ett år (broschyr)",
    "spaedbarn_kostrad.pdf": "Livsmedelsverket – Kostråd för spädbarn",
    "1177_barnmat.pdf": "1177 – Barnets mat och dryck upp till ett år",
    "bra-mat-nar-du-ar-gravid-lattlast.pdf": "Livsmedelsverket – Bra mat när du är gravid (lättläst)",
    "gravida_mat.pdf": "Livsmedelsverket – Mat att undvika när du är gravid",
    "gravida_naring.pdf": "Livsmedelsverket – Näring för gravida",
    "gravida_matmangd.pdf": "Livsmedelsverket – Hur mycket mat är lagom när du är gravid?",
    "gravida_vego.pdf": "Livsmedelsverket – Vegokunskap för gravida och ammande",
    "barn_vegetarisk.pdf": "Livsmedelsverket – Vegetarisk mat till barn",
    "barn_vegansk.pdf": "Livsmedelsverket – Vegansk mat till barn",
    "barn_1_2_ar.pdf": "Livsmedelsverket – Kostråd för barn 1–2 år",
    "bra-mat-for-barn-mellan-ett-och-tva-ar-livsmedelsverket.pdf": "Livsmedelsverket – Bra mat för barn mellan ett och två år (broschyr)",
    # Kostråd för ammande
    "bra_mat_nar_du_ammar.pdf": "Livsmedelsverket – Bra mat när du ammar",
    "ammande_naring.pdf": "Livsmedelsverket – Hur får jag tillräckligt med näring när jag ammar?",
    "ammande_mat_att_undvika.pdf": "Livsmedelsverket – Mat att undvika när du ammar",
    "ammande_matmangd.pdf": "Livsmedelsverket – Hur mycket mat är lagom när du ammar?",
    "bra-mat-nar-du-ar-ammar-lattlast-alla-delar.pdf": "Livsmedelsverket – Bra mat när du ammar (lättläst broschyr)",
    "bra-mat-for-barn-0-5-ar---handledning-for-barnhalsovarden.pdf": "Livsmedelsverket – Bra mat för barn 0–5 år, handledning för barnhälsovården (2020)",
}


# ---------------------------------------------------------------
# 1. Läsa PDF:erna – en sida i taget, med källan sparad
# ---------------------------------------------------------------
def hitta_pdf_filer(varna=True):
    """Alla PDF:er i kallor/ och dess undermappar: {filnamn: sökväg}.

    För säkerhets skull letar den också i huvudmappen, så att en PDF som råkat hamna
    där inte tappas bort. Finns samma filnamn på två ställen används det första.
    """
    sökvägar = []
    if os.path.isdir(KÄLLMAPP):
        for rot, mappar, filer in os.walk(KÄLLMAPP):
            mappar.sort()                      # alltid samma ordning, på alla datorer
            sökvägar += [os.path.join(rot, f) for f in sorted(filer) if f.lower().endswith(".pdf")]
    sökvägar += [os.path.join(MAPP, f) for f in sorted(os.listdir(MAPP)) if f.lower().endswith(".pdf")]

    hittade = {}
    for sökväg in sökvägar:
        filnamn = os.path.basename(sökväg)
        if filnamn in hittade:
            if varna:
                print(f"VARNING: {filnamn} finns på två ställen – använder {os.path.relpath(hittade[filnamn], MAPP)}")
        else:
            hittade[filnamn] = sökväg
    return hittade


def _namn_från_filnamn(filnamn):
    """Läsbart källnamn för en PDF som inte finns i KÄLLOR, t.ex. 'Bra mat for barn'."""
    namn = re.sub(r"[-_\s]+", " ", os.path.splitext(filnamn)[0]).strip()
    return namn[:1].upper() + namn[1:]


def befintliga_källor():
    """Källorna som faktiskt finns: {filnamn: källnamn}.

    En fil i KÄLLOR som saknas hoppas över med en varning, så att servern ändå startar.
    En ny PDF som inte finns i KÄLLOR tas med automatiskt (namnet skapas från filnamnet).
    När filer läggs till eller tas bort ändras fingeravtrycket och nya embeddings skapas.
    """
    hittade = hitta_pdf_filer()
    finns = {}
    for filnamn, källnamn in KÄLLOR.items():
        if filnamn in hittade:
            finns[filnamn] = källnamn
        else:
            print(f"VARNING: {filnamn} saknas och hoppas över")
    for filnamn in hittade:
        if filnamn not in KÄLLOR:
            finns[filnamn] = _namn_från_filnamn(filnamn)
            print(f"INFO: {filnamn} finns inte i KÄLLOR i rag.py – tas med som \"{finns[filnamn]}\". "
                  "Lägg gärna till ett snyggare namn där.")
    return finns


def pdf_sökväg(filnamn):
    """Var en källfil ligger (i någon av mapparna under kallor/)."""
    return hitta_pdf_filer(varna=False)[filnamn]


def läs_pdf_sidor():
    """Returnerar en lista med en dict per PDF-sida: {"källa", "sida", "text"}.

    Tidigare slogs all text ihop till en enda sträng, vilket gjorde att man
    inte visste vilken PDF en mening kom från och att sidor klistrades ihop
    utan mellanrum ("år2©"). Nu behålls varje sida för sig.
    """
    sidor = []
    for filnamn, källnamn in befintliga_källor().items():
        reader = PdfReader(pdf_sökväg(filnamn))
        for sidnummer, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""   # vissa sidor (t.ex. bilder) ger None
            # pypdf bryter rader mitt i meningar – gör om alla radbrytningar
            # och dubbla mellanslag till ett enda mellanslag
            text = re.sub(r"\s+", " ", text).strip()
            if text:
                sidor.append({"källa": källnamn, "sida": sidnummer, "text": text})
    return sidor


# ---------------------------------------------------------------
# 2. Chunking – meningsbaserad, inom varje sida
# ---------------------------------------------------------------
def skapa_chunks(sidor, max_storlek=MAX_CHUNK_STORLEK, overlap=OVERLAP):
    """Delar varje sida i chunkar av hela meningar.

    Varför meningar? pypdf ger inga tomma rader ("\\n\\n") mellan stycken,
    så den gamla styckesbaserade uppdelningen gav EN enda chunk av alla
    PDF:er. Meningsgränser (. ! ?) finns däremot alltid, och eftersom vi
    aldrig delar mitt i en mening blir varje chunk läsbar.
    """
    chunks = []
    for sida in sidor:
        # Dela sidan vid punkt, utropstecken eller frågetecken följt av mellanslag
        meningar = re.split(r"(?<=[.!?])\s+", sida["text"])

        nuvarande = []          # meningarna i chunken vi håller på att bygga
        nuvarande_längd = 0     # antal tecken i den chunken

        for mening in meningar:
            # Får meningen inte plats och chunken inte är tom: spara chunken först
            if nuvarande and nuvarande_längd + len(mening) > max_storlek:
                chunks.append(_ny_chunk(sida, nuvarande))

                # Overlap: behåll de sista meningarna (upp till ~overlap tecken)
                # så att sammanhanget följer med in i nästa chunk
                behåll = []
                for m in reversed(nuvarande):
                    if sum(len(x) for x in behåll) + len(m) > overlap:
                        break
                    behåll.insert(0, m)
                nuvarande = behåll
                nuvarande_längd = sum(len(x) + 1 for x in nuvarande)

            nuvarande.append(mening)
            nuvarande_längd += len(mening) + 1   # +1 för mellanslaget

        # Spara det som blev kvar i slutet av sidan
        if nuvarande:
            chunks.append(_ny_chunk(sida, nuvarande))

    # Släng mycket korta chunkar (t.ex. sidor med bara en rubrik eller sidnummer)
    return [c for c in chunks if len(c["text"]) >= 60]


def _ny_chunk(sida, meningar):
    """Hjälpfunktion: bygger en chunk-dict med text, källa och sidnummer."""
    return {"källa": sida["källa"], "sida": sida["sida"], "text": " ".join(meningar)}


# ---------------------------------------------------------------
# 3. Kunskapsbasen – chunkar + embeddings + sökning + svar
# ---------------------------------------------------------------
class Kunskapsbas:
    """Allt som behövs för att svara på frågor. Skapas en gång vid uppstart."""

    def __init__(self, api_nyckel=None):
        # Koppla upp mot Gemini
        self.client = genai.Client(
            api_key=api_nyckel or os.getenv("GENAI_API_KEY"), vertexai=False
        )
        # Hämta textstycken och embeddings – från embeddings.pkl om den stämmer, annars skapas nya
        self.chunks, vektorer = self._ladda_eller_skapa()
        # Normalisera alla vektorer till längd 1 en gång för alla.
        # Då blir cosine similarity bara en matrismultiplikation,
        # och alla chunkar jämförs på en gång i stället för i en loop.
        matris = np.array(vektorer, dtype=np.float32)
        self.matris = matris / np.linalg.norm(matris, axis=1, keepdims=True)

    # ---------- fingeravtryck ----------
    @staticmethod
    def _fil_fingeravtryck():
        """En 'checksumma' av själva PDF-filerna och inställningarna.

        Ändras en PDF, chunkstorleken eller embeddingmodellen ändras fingeravtrycket,
        och då skapas nya embeddings automatiskt. Eftersom vi tittar på filerna (inte
        på texten som PDF-läsaren plockar ut) blir resultatet detsamma på din dator och
        på servern, även om de har olika versioner av PDF-läsaren.
        """
        h = hashlib.sha256()
        källor = befintliga_källor()
        h.update(json.dumps([EMBEDDING_MODELL, MAX_CHUNK_STORLEK, OVERLAP, CHUNK_VERSION, källor],
                            ensure_ascii=False).encode("utf-8"))
        for filnamn in källor:
            with open(pdf_sökväg(filnamn), "rb") as f:
                h.update(f.read())
        return h.hexdigest()

    # ---------- ladda eller skapa ----------
    def _ladda_eller_skapa(self):
        fingeravtryck = self._fil_fingeravtryck()

        # Läs den sparade filen om den finns
        sparat = None
        if os.path.exists(EMBEDDINGS_FIL):
            try:
                with open(EMBEDDINGS_FIL, "rb") as f:
                    sparat = pickle.load(f)
            except Exception:
                sparat = None  # trasig fil -> skapa nya nedan

        # 1) Allt stämmer: använd sparade textstycken och embeddings direkt.
        #    Då behöver PDF:erna inte ens läsas – servern startar snabbare.
        if isinstance(sparat, dict) and sparat.get("fingeravtryck") == fingeravtryck and "chunks" in sparat:
            return sparat["chunks"], sparat["vektorer"]

        # Annars: läs PDF:erna och dela upp texten
        chunks = skapa_chunks(läs_pdf_sidor())

        # 2) Annars: skapa nya embeddings (kostar en liten summa och tar någon minut)
        print("embeddings.pkl saknas eller är inaktuell – skapar nya embeddings...")
        vektorer = self._skapa_embeddings(chunks)

        # Spara textstycken, embeddings och fingeravtryck tillsammans
        with open(EMBEDDINGS_FIL, "wb") as f:
            pickle.dump({"fingeravtryck": fingeravtryck, "chunks": chunks, "vektorer": vektorer}, f)
        return chunks, vektorer

    def _skapa_embeddings(self, chunks):
        """Skapar embeddings i batchar om 50 med paus emellan,
        för att inte slå i Gemini API:ets hastighetsbegränsning."""
        vektorer = []
        batch_storlek = 50
        for i in range(0, len(chunks), batch_storlek):
            batch = chunks[i:i + batch_storlek]
            svar = self.client.models.embed_content(
                model=EMBEDDING_MODELL,
                # Källnamnet läggs framför texten så att t.ex. en fråga om
                # "vegansk mat" lättare hittar chunkar från veganska PDF:en
                contents=[f"{c['källa']}: {c['text']}" for c in batch],
                config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"),
            )
            vektorer.extend(e.values for e in svar.embeddings)
            if i + batch_storlek < len(chunks):
                time.sleep(15)
        return vektorer

    # ---------- sökning ----------
    def _till_svenska(self, text):
        """Översätter en fråga till svenska för sökningen, och delar upp den i delfrågor.

        Returnerar (hela frågan på svenska, [delfrågor]). Går översättningen inte returneras
        (None, []), och då söker vi bara på originalfrågan (appen fungerar alltså ändå).
        Uppdelningen görs i samma anrop som översättningen, så den tar ingen extra tid.
        """
        try:
            svar = self.client.models.generate_content(
                model=CHATT_MODELL,
                contents=(
                    "Översätt frågan nedan till svenska.\n"
                    "Rad 1: hela frågan på svenska.\n"
                    "Om frågan handlar om flera olika saker (t.ex. två livsmedel), skriv sedan varje del "
                    "som en egen kort, fullständig fråga på svenska, en per rad.\n"
                    "Skriv bara frågorna, inga förklaringar, nummer eller citattecken.\n\n" + text
                ),
                config=ÖVERSÄTT_CONFIG,
            )
            rader = [r.strip(" -•\t\"") for r in (svar.text or "").splitlines()]
            rader = [r for r in rader if r]
            if not rader:
                return None, []
            return rader[0], rader[1:5]          # högst 4 delfrågor
        except Exception as fel:
            print(f"VARNING: kunde inte översätta frågan till svenska ({fel}) – söker på originalet")
            return None, []

    def hämta(self, hela, delar=()):
        """Hämtar textstycken för en fråga som kan ha flera delar.

        hela:  texter som beskriver hela frågan (original och ev. svensk översättning)
        delar: delfrågor, t.ex. ["Kan jag dricka vin?", "Kan jag dricka kaffe?"]
        Tar de TOP_K bästa för hela frågan plus de TOP_K_PER_DEL bästa för varje del,
        så att en del av frågan inte kan tränga undan en annan. Högst MAX_CHUNKAR totalt.
        """
        hela, delar = list(hela), [d for d in delar if d not in hela]
        likheter = self._likheter(hela + delar)      # ett enda anrop för alla texter
        bäst_hela = np.max(likheter[:len(hela)], axis=0)
        ordning_hela = np.argsort(bäst_hela)[::-1]
        ordning_delar = [np.argsort(rad)[::-1] for rad in likheter[len(hela):]]

        valda = {}                                   # chunkens nummer -> bästa likhet
        def lägg_till(i, likhet):
            valda[int(i)] = max(valda.get(int(i), 0.0), float(likhet))

        # 1. Garanterat med: de 4 bästa för hela frågan + de bästa för VARJE del,
        #    så att t.ex. "kaffe" inte kan trängas undan av många träffar om "vin"
        for i in ordning_hela[:4]:
            lägg_till(i, bäst_hela[i])
        for rad, ordning in zip(likheter[len(hela):], ordning_delar):
            for i in ordning[:GARANTERAT_PER_DEL]:
                lägg_till(i, rad[i])
        # 2. Fyll på med fler bra träffar (bästa först) tills taket nås
        extra = [(int(i), float(bäst_hela[i])) for i in ordning_hela[4:TOP_K]]
        for rad, ordning in zip(likheter[len(hela):], ordning_delar):
            extra += [(int(i), float(rad[i])) for i in ordning[GARANTERAT_PER_DEL:TOP_K_PER_DEL]]
        for i, l in sorted(extra, key=lambda x: x[1], reverse=True):
            if len(valda) >= MAX_CHUNKAR:
                break
            lägg_till(i, l)

        bästa = sorted(valda.items(), key=lambda x: x[1], reverse=True)
        return [{**self.chunks[i], "likhet": l} for i, l in bästa]

    def _likheter(self, texter):
        """Likheten mellan varje text och alla chunkar: en rad per text."""
        svar = self.client.models.embed_content(
            model=EMBEDDING_MODELL,
            contents=list(texter),
            config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
        )
        rader = []
        for e in svar.embeddings:
            q = np.array(e.values, dtype=np.float32)
            rader.append(self.matris @ (q / np.linalg.norm(q)))
        return np.array(rader)

    # ---------- svara ----------
    def sökträffar(self, fråga, historik=None, språk="Svenska"):
        """Hittar textstyckena för en fråga, precis som appen gör (används också av testa_sokning.py)."""
        historik = (historik or [])[-MAX_HISTORIK:]

        # Följdfrågor som "och vid 10 månader då?" är svåra att söka på ensamma.
        # Därför söker vi på den nya frågan + användarens förra fråga.
        tidigare_frågor = [m["content"] for m in historik if m["role"] == "user"]
        sökfråga = f"{tidigare_frågor[-1]} {fråga}" if tidigare_frågor else fråga

        # Annat språk än svenska: sök på både originalfrågan och en svensk översättning.
        # Frågor med flera delar ("vin och kaffe") delas upp, så att varje del får egna träffar.
        hela = [sökfråga]
        delar = dela_upp_fråga(fråga)                # enkel uppdelning vid "och", "and", "y" ...
        if språk != "Svenska":
            svensk, gemini_delar = self._till_svenska(fråga)
            if svensk:
                hela.append(f"{tidigare_frågor[-1]} {svensk}" if tidigare_frågor else svensk)
                # Delarna från Gemini + uppdelning av den svenska översättningen
                delar = gemini_delar + dela_upp_fråga(svensk) + delar
        delar = list(dict.fromkeys(delar))[:6]      # inga dubbletter, högst 6 delar

        träffar = self.hämta(hela, delar)
        return träffar

    def _förbered(self, fråga, historik, språk, profil):
        """Gör sökningen och bygger prompten. Returnerar (prompt, källor).

        Delas av svara() och svara_ström() så att de alltid beter sig likadant.
        """
        historik = (historik or [])[-MAX_HISTORIK:]
        träffar = self.sökträffar(fråga, historik, språk)
        # Behåll bara träffar som är tillräckligt lika frågan
        relevanta = [t for t in träffar if t["likhet"] >= MIN_LIKHET]

        historik_text = "\n".join(
            f"{'Användare' if m['role'] == 'user' else 'Assistent'}: {m['content']}"
            for m in historik
        ) or "(ingen)"
        om_användaren = profil_text(profil)

        # Ingen tillräckligt relevant text hittades -> botten ska säga att den inte vet.
        # Gemini får INGEN källtext, bara uppdraget att säga det på rätt språk.
        if not relevanta:
            prompt = PROMPT_VET_INTE.format(språk=språk, historik=historik_text, fråga=fråga)
            return prompt, []

        # Bygg kontexten: varje chunk märks med sin källa och sida,
        # så att Gemini vet var informationen kommer ifrån
        kontext = "\n\n".join(
            f"[Källa: {t['källa']}, sida {t['sida']}]\n{t['text']}" for t in relevanta
        )
        prompt = PROMPT_SVAR.format(
            språk=språk, profil=om_användaren, historik=historik_text,
            kontext=kontext, fråga=fråga,
        )
        # Unika källnamn i den ordning de hittades (dict.fromkeys tar bort dubbletter)
        källor = list(dict.fromkeys(t["källa"] for t in relevanta))
        return prompt, källor

    def svara(self, fråga, historik=None, språk="Svenska", profil=None):
        """Svarar på en fråga och returnerar hela svaret på en gång.

        Används av evaluering.ipynb och Streamlit-appen.
        historik: tidigare meddelanden [{"role": "user"/"assistant", "content": ...}], UTAN den nya frågan.
        profil:   t.ex. {"typ": "barn", "månader": 7} – se profil_text().
        Returnerar {"svar": text, "källor": [källnamn, ...]}.
        """
        prompt, källor = self._förbered(fråga, historik, språk, profil)
        response = self.client.models.generate_content(
            model=CHATT_MODELL, contents=prompt, config=GENERERINGS_CONFIG
        )
        return {"svar": response.text, "källor": källor}

    def svara_ström(self, fråga, historik=None, språk="Svenska", profil=None):
        """Som svara(), men skickar svaret i små bitar medan Gemini skriver det.

        Används av webbappen så att texten syns direkt i stället för efter flera sekunder.
        Ger först ("källor", [...]) och sedan ("text", "bit av svaret") flera gånger.
        """
        prompt, källor = self._förbered(fråga, historik, språk, profil)
        yield "källor", källor
        for bit in self.client.models.generate_content_stream(
            model=CHATT_MODELL, contents=prompt, config=GENERERINGS_CONFIG
        ):
            if bit.text:   # vissa bitar innehåller ingen text, de hoppas över
                yield "text", bit.text


# ---------------------------------------------------------------
# Dela upp svenska frågor med flera delar – utan något extra anrop
# ---------------------------------------------------------------
def dela_upp_fråga(fråga):
    """Delar t.ex. "Kan jag dricka vin och kaffe?" i ["Kan jag dricka vin", "kaffe"].

    Enkel regel: dela vid frågetecken, kommatecken och ord som "och", "eller", "samt"
    – och motsvarande på några andra språk (and, or, y, o, und, oder, et, ou).
    Delarna används bara för att hitta FLER textstycken; hela frågan söks alltid också.
    Ger en tom lista om frågan bara har en del.
    """
    delar = re.split(r"[?¿,]|\s(?:och|samt|eller|and|or|y|o|e|und|oder|et|ou)\s", fråga, flags=re.IGNORECASE)
    delar = [d.strip() for d in delar if d and len(d.strip()) >= 3]
    return delar[:4] if len(delar) > 1 else []


# ---------------------------------------------------------------
# Användarprofil – barnets ålder / graviditetsvecka
# ---------------------------------------------------------------
def profil_text(profil):
    """Gör om profilen till en mening som läggs in i prompten.

    Appen räknar själv ut åldern och skickar ALDRIG exakta datum hit (dataminimering):
      {"typ": "barn",   "månader": 7}              -> barnet är 7 månader
      {"typ": "barn",   "månader": 0, "veckor": 3} -> barnet är 3 veckor
      {"typ": "gravid", "vecka": 25, "dag": 1}     -> gravid i vecka 25+1
      {"typ": "ammar",  "månader": 4}              -> ammar, barnet är 4 månader
      {"typ": "ammar"}                             -> ammar, barnets ålder ej angiven
      None                                         -> inget angivet
    """
    ingen = "Användaren har inte angett barnets ålder eller graviditetsvecka."
    if not profil:
        return ingen

    if profil.get("typ") == "gravid" and profil.get("vecka") is not None:
        vecka, dag = profil["vecka"], profil.get("dag") or 0
        if vecka >= 42:
            return "Användarens beräknade förlossningsdatum har passerat. Barnet kan redan vara fött – fråga vid behov."
        return f"Användaren är gravid i vecka {vecka}+{dag}."

    def ålder_text():
        # Barnets ålder som text, t.ex. "3 veckor", "7 månader" eller "1 år och 2 månader"
        månader = profil["månader"]
        if månader == 0:
            return f"{profil.get('veckor') or 0} veckor"
        if månader < 24:
            return f"{månader} månader"
        år, mån = divmod(månader, 12)
        return f"{år} år och {mån} månader" if mån else f"{år} år"

    if profil.get("typ") == "ammar":
        # Den som ammar: svara utifrån kostråden för ammande (och barnets ålder om den finns)
        if profil.get("månader") is not None:
            return f"Användaren ammar. Barnet är {ålder_text()} gammalt."
        return "Användaren ammar. Barnets ålder är inte angiven."

    if profil.get("typ") == "barn" and profil.get("månader") is not None:
        return f"Användarens barn är {ålder_text()} gammalt."

    return ingen


# ---------------------------------------------------------------
# 4. Promptar – en enda version som alla tre filerna använder
# ---------------------------------------------------------------
PROMPT_SVAR = """
Du är en hjälpsam assistent för gravida, ammande, närstående och föräldrar med spädbarn eller småbarn (0–2 år).

REGLER:
- Använd ENDAST informationen under "Information från källorna". Använd aldrig egen kunskap.
- Om svaret inte står i informationen: säg tydligt att du inte vet och hänvisa till BVC, barnmorskan eller 1177. Gissa aldrig, och fyll aldrig i med allmän kunskap.
- Många frågor har flera delar, t.ex. "mitt barn är 10 månader och äter veganskt, vad behöver hon?" (ålder + kosthållning).
  Gå igenom varje del för sig och kombinera det som står i ALLA relevanta textstycken, inte bara det första.
- Kontrollera för varje del av frågan om informationen faktiskt svarar på den. Svara på de delar som täcks,
  och säg tydligt vilken del du inte har svar på. Låtsas aldrig att svaret är fullständigt om det inte är det.
- Barnets ålder, graviditetsvecka eller att användaren ammar står under "Om användaren". Använd det och anpassa svaret efter det, utan att fråga igen.
- Om frågan gäller ett barn och åldern varken står under "Om användaren", i frågan eller i konversationen: fråga efter barnets ålder innan du svarar.
- Börja med en direkt rekommendation och förklara sedan varför. Formulera dig enkelt i korta stycken.
- Citera aldrig ordagrant – omformulera allt med egna ord.
- Kom ihåg det som sagts tidigare i konversationen, t.ex. barnets ålder.
- Om du tidigare i konversationen sa att information saknades, men svaret nu finns under "Information från källorna":
  svara utifrån källorna. Källorna gäller alltid före tidigare svar i konversationen.
- Om användaren bara skriver något kort som "ok" eller "tack": svara kort och vänligt och påminn om att de kan ställa fler frågor.
- Skriv ingen källhänvisning i svaret. Appen visar redan att informationen kommer från Livsmedelsverket och 1177.
- Användaren har valt språk: {språk}. Svara alltid på det språket, oavsett vilket språk frågan är skriven på.

Om användaren:
{profil}

Tidigare konversation:
{historik}

Information från källorna:
{kontext}

Fråga: {fråga}
"""

PROMPT_VET_INTE = """
Du är en assistent som ger kostråd för gravida, ammande och barn 0–2 år, baserat på Livsmedelsverket och 1177.
Ingen information i källorna matchade användarens meddelande. Du får INTE svara med egen kunskap.

- Om meddelandet är en fråga: säg vänligt att du inte vet svaret eftersom det inte finns i ditt källmaterial,
  och hänvisa till BVC, barnmorskan eller 1177.se. Om frågan ligger utanför ämnet, nämn kort vad du kan svara på.
- Om meddelandet bara är "ok", "tack", en hälsning eller liknande: svara kort och vänligt och påminn om att de kan ställa frågor.

Svara på språket: {språk}.

Tidigare konversation:
{historik}

Användarens meddelande: {fråga}
"""
