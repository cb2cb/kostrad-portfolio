import json
import logging
import os
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import Literal

from pydantic import BaseModel, Field

# Samma RAG-logik och samma prompt som Streamlit-appen – allt ligger i rag.py
from rag import Kunskapsbas

# ---------------------------------------------------------------
# Loggning
# ---------------------------------------------------------------
# Skriver till terminalen lokalt och till "Logs" i Google Cloud när servern körs där.
# OBS: vi loggar ALDRIG användarnas frågor eller ålder – bara tekniska händelser.
# Enda undantaget: när användaren själv trycker på "Rapportera" på ett svar (se /rapportera).
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logg = logging.getLogger("kostrad")

app = FastAPI(title="Kostråd-chatbot API")

# Tillåt anrop från mobilappen (och från webbläsare under utveckling)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------
# Lås: bara appen får använda servern
# ---------------------------------------------------------------
# APP_NYCKEL är ett hemligt lösenord som både servern och appen känner till.
# Appen skickar det i varje anrop; anrop utan rätt nyckel stoppas.
# Är APP_NYCKEL inte satt (t.ex. när du testar lokalt) är servern olåst.
APP_NYCKEL = os.getenv("APP_NYCKEL")


def kontrollera_nyckel(x_app_nyckel: str | None = Header(default=None)):
    """Körs före varje fråga. Header(...) läser rubriken "X-App-Nyckel" i anropet."""
    if not APP_NYCKEL:
        return  # olåst läge
    # compare_digest jämför på ett sätt som inte avslöjar hur stor del som var rätt
    if not x_app_nyckel or not secrets.compare_digest(x_app_nyckel, APP_NYCKEL):
        raise HTTPException(status_code=401, detail="Ogiltig app-nyckel")


# ---------------------------------------------------------------
# Larm när Gemini-krediterna är slut
# ---------------------------------------------------------------
def är_krediter_slut(fel: Exception) -> bool:
    """Gemini svarar 402 när förbetalda krediter är slut, och 429 RESOURCE_EXHAUSTED
    när ett kostnadstak eller en gräns är nådd."""
    kod = getattr(fel, "code", None)
    status = str(getattr(fel, "status", "")) + str(fel)
    return kod == 402 or (kod == 429 and "RESOURCE_EXHAUSTED" in status)


def logga_fel(fel: Exception):
    """Loggar felet. Kreditbrist får en egen, tydlig rad som Google Cloud kan larma på."""
    if är_krediter_slut(fel):
        # Den här exakta texten letar larmet i Google Cloud efter (se README)
        logg.error("GEMINI_KREDITER_SLUT – fyll på krediter i AI Studio. Detaljer: %s", fel)
    else:
        logg.error("Fel vid anrop till Gemini: %s", fel)


# ---------------------------------------------------------------
# Ladda kunskapsbasen en gång vid uppstart
# ---------------------------------------------------------------
kb = Kunskapsbas()
logg.info("Kunskapsbasen är laddad (%d textstycken). Lås: %s", len(kb.chunks), "PÅ" if APP_NYCKEL else "AV")


# ---------------------------------------------------------------
# Datamodeller – beskriver vad appen skickar in
# ---------------------------------------------------------------
class Meddelande(BaseModel):
    role: str                                # "user" eller "assistant"
    content: str = Field(max_length=8000)    # själva texten


class Profil(BaseModel):
    # Bara ålder/vecka – aldrig exakta datum (de stannar i mobilen).
    # Field(ge=..., le=...) stoppar orimliga värden.
    typ: Literal["barn", "gravid", "ammar"]   # "ammar" = ammar, barnets ålder är frivillig
    månader: int | None = Field(default=None, ge=0, le=60)   # barnets ålder i hela månader
    veckor: int | None = Field(default=None, ge=0, le=5)     # bara för barn under en månad
    vecka: int | None = Field(default=None, ge=0, le=45)     # graviditetsvecka
    dag: int | None = Field(default=None, ge=0, le=6)        # dagar in i graviditetsveckan


class Fråga(BaseModel):
    # Längdgränserna stoppar jättelånga anrop som annars kostar mycket hos Gemini
    fråga: str = Field(max_length=800)                       # samma gräns som skrivfältet i appen
    språk: str = Field(default="Svenska", max_length=40)     # hamnar i prompten, så den hålls kort
    historik: list[Meddelande] = []   # tidigare meddelanden, UTAN den nya frågan (rag.py använder bara de 10 sista)
    profil: Profil | None = None      # valfri: barnets ålder / graviditetsvecka / ammar


class Rapport(BaseModel):
    """Ett svar som användaren har rapporterat som felaktigt eller olämpligt."""
    fråga: str = Field(default="", max_length=2000)   # frågan som ledde till svaret
    svar: str = Field(max_length=8000)                # svaret som rapporteras
    språk: str = Field(default="Svenska", max_length=40)


def _argument(data: Fråga):
    """Gör om Pydantic-objekten till vanliga dicts som rag.py förväntar sig."""
    return dict(
        fråga=data.fråga,
        historik=[m.model_dump() for m in data.historik],
        språk=data.språk,
        profil=data.profil.model_dump(exclude_none=True) if data.profil else None,
    )


# ---------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------
@app.post("/fraga/strom", dependencies=[Depends(kontrollera_nyckel)])
def ställ_fråga_ström(data: Fråga):
    """Svaret skickas i bitar medan Gemini skriver det (det mobilappen använder).

    Formatet är NDJSON: en JSON-rad per händelse, t.ex.
      {"typ": "källor", "data": ["Livsmedelsverket – ..."]}
      {"typ": "text",   "data": "Nej, honung ska inte"}
      {"typ": "klar"}
    Vid fel: {"typ": "fel", "data": "otillgänglig"} eller {"typ": "fel", "data": "okänt"}
    """
    def händelser():
        try:
            for typ, innehåll in kb.svara_ström(**_argument(data)):
                # ensure_ascii=False behåller å, ä, ö som de är
                yield json.dumps({"typ": typ, "data": innehåll}, ensure_ascii=False) + "\n"
            yield json.dumps({"typ": "klar"}) + "\n"
        except Exception as e:
            logga_fel(e)
            # Appen får bara en kort felkod – tekniska detaljer stannar i loggen
            kod = "otillgänglig" if är_krediter_slut(e) else "okänt"
            yield json.dumps({"typ": "fel", "data": kod}) + "\n"

    return StreamingResponse(händelser(), media_type="application/x-ndjson")


@app.post("/rapportera", dependencies=[Depends(kontrollera_nyckel)])
def rapportera(data: Rapport):
    """Tar emot en rapport om ett felaktigt eller olämpligt svar.

    Google Play kräver att appar med AI-svar låter användaren rapportera svar inifrån appen.
    Rapporten sparas i serverns logg (Google Cloud sparar loggar i 30 dagar).
    Sök efter ANVANDARRAPPORT i Logs Explorer för att se rapporterna, eller sätt upp
    ett e-postlarm på den texten på samma sätt som för GEMINI_KREDITER_SLUT (se README).
    """
    logg.warning("ANVANDARRAPPORT %s", json.dumps(
        {"språk": data.språk, "fråga": data.fråga, "svar": data.svar}, ensure_ascii=False))
    return {"status": "mottagen"}


@app.get("/")
def root():
    # Används av webbläsartestet och av Google Cloud för att se att servern lever
    return {"status": "Kostråd-chatbot API körs!"}
