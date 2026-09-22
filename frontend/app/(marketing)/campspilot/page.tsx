import Image from 'next/image'
import Link from 'next/link'
import BrandMark from '../../components/marketing/BrandMark'
import BootCurtain from '../../components/marketing/BootCurtain'
import Grain from '../../components/marketing/Grain'
import { CP_IMAGES } from './images'

export default function CampsPilotPage() {
  return (
    <div className="cp-scope">
      <BootCurtain />
      <Grain />

      <nav className="nav" id="nav">
        <div className="wrap nav-in">
          <a className="brand" href="#top">
            <BrandMark className="mark-svg" width={35} height={24} />
            CampsPilot<span className="sr"> — Startseite</span>
          </a>
          <div className="nav-links">
            <a href="#ordnung">Wie es funktioniert</a>
            <a href="#vertrauen">Vertrauen</a>
            <a href="#pilot">Pilot</a>
          </div>
          <a className="btn sm" href="#pilot">Pilotplatz anfragen</a>
        </div>
      </nav>

      <header className="hero" id="top">
        <div className="hero-media">
          <div id="heroImg" className="cp-fill">
            <Image
              src={CP_IMAGES.hero.src}
              alt="Leerer, vom Flutlicht beschienener Fußballplatz bei Nacht; das nasse Grün spiegelt die Lampen."
              fill
              sizes="100vw"
              priority
              fetchPriority="high"
              placeholder="blur"
              blurDataURL={CP_IMAGES.hero.blurDataURL}
            />
          </div>
        </div>
        <div className="hero-veil" />
        <div className="wrap hero-in">
          <div className="hero-grid">
            <p className="label" data-rise="">Für Vereine und Fußballschulen, die Feriencamps veranstalten</p>
            <h1 className="d1" id="heroTitle">Jedes Camp beginnt mit einem Zettel.</h1>
            <p className="lead" data-rise="">Und endet in fünf Systemen, die nicht miteinander reden. CampsPilot ist das eine, das übrig bleibt.</p>
            <div className="hero-cta" data-rise="">
              <a className="btn fill" href="#pilot">Pilotplatz anfragen</a>
              <a className="btn ghost" href="#ordnung">Wie es funktioniert</a>
            </div>
            <div className="scroll-hint" data-rise=""><i />Weiterscrollen</div>
          </div>
        </div>
      </header>

      <section className="chapter-zettel" id="zettel">
        <div className="z-stage" id="zStage">
          <div className="z-bg">
            <div id="zImg" className="cp-fill">
              <Image
                src={CP_IMAGES.zettel.src}
                alt="Ein regennasses Klemmbrett mit handschriftlicher Liste und Kugelschreiber auf einer Holzbank am Spielfeldrand."
                fill
                sizes="100vw"
                loading="lazy"
                placeholder="blur"
                blurDataURL={CP_IMAGES.zettel.blurDataURL}
              />
            </div>
          </div>
          <div className="z-veil" />
          <div className="z-dim" id="zDim" />
          <div className="wrap z-in">
            <div className="z-head">
              <p className="label">Der Zettel</p>
              <h2 className="d2">Fünf Systeme für ein Camp.</h2>
            </div>
            <ul className="z-list" id="zList">
              <li className="z-item"><span className="t">Die Ausschreibung als PDF auf der Vereinswebsite</span><i className="strike" /></li>
              <li className="z-item"><span className="t">Das Anmeldeformular bei irgendeinem Anbieter</span><i className="strike" /></li>
              <li className="z-item"><span className="t">Rückfragen der Eltern per E-Mail</span><i className="strike" /></li>
              <li className="z-item"><span className="t">Teilnehmer und Zahlungen in Excel</span><i className="strike" /></li>
              <li className="z-item"><span className="t">Überweisungen von Hand abgleichen</span><i className="strike" /></li>
            </ul>
            <div className="z-resolve" id="zResolve">
              <p className="d3">Keines weiß, was das andere weiß.</p>
              <p>Am Ende weiß es nur einer: Sie. Und wenn Sie im Urlaub sind, weiß es niemand.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="light" id="ordnung">
        <div className="wrap sec">
          <div className="sec-head">
            <p className="label on-light" data-rise="">Die Ordnung</p>
            <h2 className="d2" data-split="">Alles, was ein Camp braucht. An einer Stelle.</h2>
            <p className="lead" data-rise="">Keine Plattform für alles. Eine Software für genau diesen einen Ablauf: ausschreiben, anmelden, bezahlen, durchführen.</p>
          </div>
          <div className="feat">
            <article className="feat-i" data-rise="">
              <span className="k">Für Eltern</span>
              <h3>Eine Anmeldung, die in vier Minuten erledigt ist</h3>
              <p>Auf dem Handy, ohne Benutzerkonto, mit sofortiger Bestätigung und einem Zahlungsweg, den man versteht. Sie sehen jede Anmeldung in dem Moment, in dem sie eingeht.</p>
            </article>
            <article className="feat-i" data-rise="">
              <span className="k">Für den Organisator</span>
              <h3>Ein Vormittag, an dem klar ist, was zu tun ist</h3>
              <p>Offene Zahlungen, fehlende Notfallnummern, volle Camps, Warteliste. Nicht als Diagramm, sondern als Liste in ganzen Sätzen, mit einem Knopf pro Zeile.</p>
            </article>
            <article className="feat-i" data-rise="">
              <span className="k">Für den Verein</span>
              <h3>Ein zweiter Verein, der keine Zeile Code kostet</h3>
              <p>Eigenes Wappen, eigene Vereinsfarbe, eigene Camps und Preise. Dieselbe Plattform, ohne Sonderlocke und ohne eigenes Deployment.</p>
            </article>
          </div>
        </div>
      </section>

      <div className="band">
        <div id="bandImg" className="cp-fill-tall">
          <Image
            src={CP_IMAGES.leibchen.src}
            alt="Ein sauber gefalteter Stapel oranger und dunkelblauer Trainingsleibchen auf einer Holzbank am Platzrand."
            fill
            sizes="100vw"
            loading="lazy"
            placeholder="blur"
            blurDataURL={CP_IMAGES.leibchen.blurDataURL}
          />
        </div>
      </div>

      <section id="vertrauen">
        <div className="wrap sec">
          <div className="trust">
            <div>
              <div className="sec-head wide">
                <p className="label" data-rise="">Die Linie</p>
                <h2 className="d2" data-split="">Auf dieser Seite sehen Sie kein einziges Kind.</h2>
                <p className="lead" style={{ color: 'var(--fog-2)' }} data-rise="">Das ist kein Zufall und kein Mangel an Fotos. Wer die Daten von Minderjährigen verwaltet, sollte sie nicht zur Werbung machen.</p>
              </div>
              <ul className="trust-list">
                <li data-rise=""><span className="n">01</span><p>Angaben zum Kind werden nur für das gebuchte Camp verwendet und sechs Monate nach Camp-Ende gelöscht.</p></li>
                <li data-rise=""><span className="n">02</span><p>Die Foto-Einwilligung wird getrennt abgefragt, ist nie vorausgewählt und jederzeit widerrufbar. Ohne sie nimmt das Kind ganz normal teil.</p></li>
                <li data-rise=""><span className="n">03</span><p>Jeder Verein sieht ausschließlich seine eigenen Teilnehmer. Getrennt auf Datenebene, nicht per Filter in der Oberfläche.</p></li>
                <li data-rise=""><span className="n">04</span><p>Tägliche Sicherung, dokumentierte Migrationen, nachvollziehbare Änderungen an jedem Teilnehmerdatensatz.</p></li>
              </ul>
            </div>
            <figure className="trust-fig" data-rise="">
              <Image
                id="netzImg"
                src={CP_IMAGES.netz.src}
                alt="Nahaufnahme eines Tornetzes von hinten, gegen das Flutlicht; an jeder Masche hängen Wassertropfen."
                width={CP_IMAGES.netz.width}
                height={CP_IMAGES.netz.height}
                sizes="(min-width: 900px) 38vw, 100vw"
                loading="lazy"
                placeholder="blur"
                blurDataURL={CP_IMAGES.netz.blurDataURL}
                style={{ width: '100%', height: 'auto' }}
              />
              <figcaption>Das Netz hält, weil jede Masche hält. Software für Vereinsdaten funktioniert genauso.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <div className="band">
        <div id="linieImg" className="cp-fill-tall">
          <Image
            src={CP_IMAGES.linie.src}
            alt="Nahaufnahme einer frisch gezogenen weißen Kalklinie im taunassen, dunkelgrünen Rasen."
            fill
            sizes="100vw"
            loading="lazy"
            placeholder="blur"
            blurDataURL={CP_IMAGES.linie.blurDataURL}
          />
        </div>
      </div>

      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <BrandMark className="watermark mark-svg" />
        <div className="wrap sec" style={{ position: 'relative', zIndex: 1 }}>
          <div className="sec-head wide">
            <p className="label" data-rise="">Die Messlatte</p>
            <h2 className="d2" data-split="">Woran wir uns messen lassen.</h2>
            <p className="lead" style={{ color: 'var(--fog-2)' }} data-rise="">Keine Erfolgsmeldungen. Das sind die Zielwerte, an denen der Pilot besteht oder scheitert — nachgehalten und offengelegt.</p>
          </div>
          <div className="metrics" id="metrics">
            <div className="metric"><span className="v num" data-count="5" data-pre="unter " data-post=" Min.">unter 5 Min.</span><span className="c">bis eine Anmeldung abgeschickt ist</span></div>
            <div className="metric"><span className="v num" data-count="95" data-pre="über " data-post=" %">über 95 %</span><span className="c">Anmeldungen ohne manuelle Korrektur</span></div>
            <div className="metric"><span className="v num" data-count="2" data-pre="unter " data-post=" Std.">unter 2 Std.</span><span className="c">bis ein neuer Verein eingerichtet ist</span></div>
            <div className="metric"><span className="v num" data-count="0" data-pre="" data-post="">0</span><span className="c">Anmeldungen, die im falschen Verein landen</span></div>
          </div>
        </div>
      </section>

      <section className="close" id="pilot">
        <div className="close-media">
          <div id="closeImg" className="cp-fill">
            <Image
              src={CP_IMAGES.flutlicht.src}
              alt="Ein Flutlichtmast und das flache Dach eines Vereinsheims vor tiefblauem Abendhimmel, die Lampen gerade eingeschaltet."
              fill
              sizes="100vw"
              loading="lazy"
              placeholder="blur"
              blurDataURL={CP_IMAGES.flutlicht.blurDataURL}
            />
          </div>
        </div>
        <div className="close-veil" />
        <div className="wrap close-in">
          <div className="sec-head wide">
            <p className="label" data-rise="">Pilot</p>
            <h2 className="d2" data-split="">Zwei Vereine sind drauf. Es ist Platz für wenige mehr.</h2>
            <p className="lead" style={{ color: 'var(--fog-2)' }} data-rise="">CampsPilot ist im Pilotbetrieb. Wir nehmen Vereine auf, die im kommenden Jahr ein bis zehn Camps veranstalten und bereit sind, uns zu sagen, was fehlt.</p>
          </div>
          <form className="form" id="pilotForm" noValidate>
            <label htmlFor="pf-verein"><span>Verein oder Fußballschule</span>
              <input id="pf-verein" name="verein" type="text" placeholder="KSV Baunatal" autoComplete="organization" /></label>
            <label htmlFor="pf-mail"><span>E-Mail</span>
              <input id="pf-mail" name="email" type="email" placeholder="name@verein.de" autoComplete="email" /></label>
            <div className="act"><button className="btn fill" type="submit">Pilotplatz anfragen</button></div>
          </form>
          <p className="form-note" id="formNote">
            Aktuelle Pilotvereine: <strong>KSV Baunatal</strong> und <strong>JK Performance Academy</strong>.
          </p>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap foot-in">
          <a className="brand" href="#top">
            <BrandMark className="mark-svg" width={35} height={24} />
            CampsPilot
          </a>
          <span className="cl">Anmeldung und Verwaltung für Fußballcamps</span>
          <nav className="foot-links">
            <Link href="/campspilot/impressum">Impressum</Link>
            <Link href="/campspilot/datenschutz">Datenschutz</Link>
            <Link href="/campspilot/teilnahmebedingungen">Teilnahmebedingungen</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
