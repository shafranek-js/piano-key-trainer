# Piano Key Trainer — Roadmap

Aktualizovano: 2026-09-23  
Aktualni build: **v6.0 Two-hand Introduction**

---

## Produktova vize

Premiovy desktop trenazer, ktery vede od orientace na klaviature pres spaced repetition az k realnemu hrani kratkych melodii, cteni not a rytmu.

Zakladni pravidla:
- aktivni practice screen ma byt cisty, stabilni a bez zbytecneho scrollovani;
- ruzne dovednosti maji oddelene memory units;
- FSRS resi planovani pameti, ostatni treninkove vrstvy ho nesmi potichu zkreslovat;
- MIDI / mys / klavesnice se pouzivaji jen tam, kde odpovidaji skutecnemu trenovanemu skillu;
- vizualni QA je povinna soucast kazde vetsi UI iterace.

---

## Hotovo

### v3.2 — Structured Sessions ✅
- 3 min / 8 min / all due
- due-first queue
- session summary

### v3.3 — Web MIDI + Acoustic Piano ✅
- Web MIDI input
- Salamander Grand Piano / Yamaha C5 samples
- zadny synteticky fallback

### v3.4 — Cold Test ✅
- 20 nezavislych uloh
- bez vlivu na FSRS

### v3.5 — Confusion Engine ✅
- first-attempt confusion matrix
- contrast practice

### v4.0–v4.2 — Notation / Ear / Curriculum ✅
- nota na osnovi -> klavesa
- relativni sluch od C4
- postupne odemykani materialu

### v4.3–v4.7 — Premium UX + Guided Lessons ✅
- kompaktni desktop menu
- settings drawer
- skryty context drawer
- guided lessons
- adaptive practice surfaces
- 4oktavova realisticka klaviatura
- stabilni pevna pozice klaviatury
- dual input pro patternIdentify

### v4.8 — Stabilization QA ✅
- regression checks
- desktop visual QA
- stabilni navigace a input routing

### v5.0 — Calibration Dashboard ✅
- predicted R vs actual recall
- calibration buckets
- ECE / Brier
- readiness pro personalni FSRS

### v5.2 — Repertoire / Wait Mode ✅
- jednoduche melodie
- presna fyzicka klavesa / MIDI
- chybna nota neposouva kurzor
- historie vysledku mimo FSRS

### v5.3 — Accessibility & Input Polish ✅
- keyboard menu navigation
- focus states
- reduced motion
- touch behavior
- MIDI-first preference

### v5.4 — Long-term Learning Analytics ✅
- weekly recall trend
- weekly reaction trend
- skill retention
- Cold Test / repertoire history

### v5.5 — Rhythm & Tempo ✅
- Wait / Slow 60 / Normal 90
- optional metronome
- timing accuracy oddelena od pitch accuracy
- rytmus neovlivnuje FSRS

### v5.6 — Staff Repertoire ✅
- prepinac **Klavesy / Noty**
- melodie na houslovem stanu
- aktualni nota zvyraznena
- Wait / Slow / Normal + MIDI

### v5.7 — Phrase & Measure Reading ✅
- taktove cary
- **4/4 time signature**
- zvyrazneni aktualniho taktu
- seskupeni po kratkych frazich
- jednoduche ctvrtnove pauzy ve vybranych melodiich
- pauza je soucasti timing intervalu
- vizualni **count-in 4–3–2–1** pred Slow / Normal
- metronome accent na zacatku taktu
- pitch / rhythm / FSRS zustavaji oddelene

---


### v5.9.1 — Task Feedback UX ✅
- reaction time presunut do kompaktniho status stripu pod zadanim
- feedback zrusen jako samostatny pravy panel
- feedback je jednoradkovy a kontextovy
- `Ne vim` je sekundarni akce vpravo, s hintem `Enter`
- uzivatelske texty nepouzivaji technicke FSRS labely Again/Good/P85
- keyboard zustava stabilni bottom anchor

## Dalsi kroky

### v5.8 — Left / Right Hand Foundations ✅
- nove guided lessons pro pravou a levou ruku
- prava C position: C4–G4 = prsty 1–5
- leva C position: C3–G3 = prsty 5–1
- finger-number overlay pouze behem hand lesson
- aplikace overuje spravnou klavesu / MIDI, ale netvrdi, ze umi detekovat skutecny pouzity prst
- prstoklad je guided self-check
- ruce se zatim trenuji oddelene, bez dvourucni koordinace


### v5.8.1 — Task Stage + Bottom-docked Keyboard ✅
- klaviatura je pevny spodní anchor aktivniho practice screenu
- stred obrazovky funguje jako jednotna **operacni oblast ulohy**
- podle typu cviceni se v centru zobrazuji odpovedni tlacitka, instrukce, notovy stan nebo prubeh melodie
- answer controls uz nejsou pod klaviaturou
- song note lane byl presunut z maleho banneru do Task Stage
- nazvy not v repertoire modu maji vlastni vysku a uz se nemaji oriznout
- staff repertoire dostal vetsi centralni plochu
- horni song banner zustava pouze jako kompaktni status + akce

### v5.9 — Dynamics & Articulation Basics ✅
- MIDI velocity jako samostatna performance metrika
- cile `p / mf / f`
- samostatne vyhodnoceni dynamiky
- `legato / detached` pres MIDI note-on / note-off a pomer skutecne delky tonu k ocekavane delce
- articulation se vyhodnocuje pouze v Tempo Mode
- screen mouse dal funguje pro pitch/timing, ale aplikace nepredstira mereni sily dotyku
- dynamics / articulation se ukladaji do repertoire history oddelene od pitch / rhythm
- zadna z techto metrik neovlivnuje FSRS

### v6.0 — Two-hand Introduction ✅
- nova sekce **Dve ruce**
- 3 velmi kratke koordinacni patterny:
  - zrcadlove pary
  - leva drzi C3 + prava hraje C4–G4
  - ping-pong leve / prave ruky
- leva ruka je vizualne fialova, prava modra
- Wait / 60 BPM
- pitch chyby se ukladaji samostatne
- rhythm accuracy se vyhodnocuje samostatne v 60 BPM
- MIDI meri skutecnou koordinaci:
  - simultanni onset gap u paru
  - skutecne drzeni bass anchoru
- mys zustava dostupna pro nacvik sekvence, ale aplikace nepredstira objektivni coordination score
- two-hand historie je oddelena od FSRS

### v5.1 — Optional Personal FSRS Tuning ⏳
Zustava zamerne odlozeno, dokud Calibration Dashboard neukaze dostatek kvalitnich scheduled-review dat.

---

## Nejblizsi priorita

**v5.1 Optional Personal FSRS Tuning** zustava jediny puvodne naplanovany hlavni blok, ale je zamerne zamceny do doby, nez Calibration Dashboard ukaze dostatek scheduled-review dat. Do te doby ma smysl hlavne sbirat realne treningove zaznamy a delat stabilizacni / UX upravy podle pouzivani.
