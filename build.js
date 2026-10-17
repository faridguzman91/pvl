#!/usr/bin/env node
/**
 * Paul van Laak — static site generator.
 *
 * Reads the project copy straight out of the .txt files in work/<slug>/ and
 * writes a Studio Henk-style detail page to work/<slug>/index.html, plus the
 * work overview at work/index.html and the homepage at index.html.
 *
 * Bilingual (NL/EN): every bit of interface text and project metadata is
 * registered in STRINGS and emitted twice — once as Dutch text in the HTML
 * (the document default) and once into i18n/nl.json + i18n/en.json, which
 * js/script.js swaps in on the client. Generating both from one source means
 * the dictionaries can never drift out of sync with the markup.
 *
 * Project body copy is NOT translated: it is whatever language the source
 * .txt was written in. Those blocks carry lang="xx" plus a .lang-note that
 * only shows when the interface language differs.
 *
 * Run with:  node build.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const LANGS = ['nl', 'en'];
const DEFAULT_LANG = 'nl'; // the language baked into the generated HTML

/* ------------------------------------------------------------ i18n core -- */

/** A value that differs per language. Plain strings are used as-is for both. */
const L = (nl, en) => ({ nl, en });

/** key -> { nl, en } */
const STRINGS = {};

function reg(key, value) {
  STRINGS[key] = typeof value === 'string' ? { nl: value, en: value } : value;
  return key;
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** ` data-i18n="key"` — the hook script.js looks for. */
const A = (key) => ` data-i18n="${key}"`;
/** The default-language text for a key, escaped. */
const V = (key) => esc(STRINGS[key].nl);
/** Same, but for strings that legitimately contain markup (a <br>). */
const VH = (key) => STRINGS[key].nl;
/** Attribute hook, e.g. AT('aria-label', 'carousel.prev'). */
const AT = (attr, key) => ` data-i18n-${attr}="${key}" ${attr}="${esc(STRINGS[key].nl)}"`;

/* --------------------------------------------------------- interface copy -- */

const UI = {
  'announce': L(
    'Atelier 81 — Ontwerpbureau voor Licht & Enscenering',
    'Atelier 81 — Design office for Light & Staging'
  ),

  'nav.aria': L('Hoofdmenu', 'Main menu'),
  'nav.work': L('Werk', 'Work'),
  'nav.about': L('Over', 'About'),
  'nav.contact': L('Contact', 'Contact'),
  'nav.menu': L('Menu', 'Menu'),
  'lang.aria': L('Taal kiezen', 'Choose language'),

  'crumb.aria': L('Kruimelpad', 'Breadcrumb'),
  'crumb.home': L('Home', 'Home'),

  'cta.contact': L('Neem contact op', 'Get in touch'),
  'cta.allWork': L('Alle projecten', 'All projects'),

  'pdp.specs': L('Project', 'Project'),
  'pdp.moreWork': L('Meer werk', 'More work'),

  'carousel.aria': L('carrousel', 'carousel'),
  'carousel.slide': L('dia', 'slide'),
  'carousel.photos': L('Projectfoto’s', 'Project photos'),
  'carousel.prev': L('Vorige foto', 'Previous photo'),
  'carousel.next': L('Volgende foto', 'Next photo'),

  'rail.prev': L('Vorige', 'Previous'),
  'rail.next': L('Volgende', 'Next'),

  'help.title': L(
    'Benieuwd wat licht<br>voor jouw ruimte doet?',
    'Curious what light<br>does to your space?'
  ),
  'help.body': L(
    'Elk project begint met kijken. Samen met opdrachtgever, architect en uitvoerder zoeken we naar de balans tussen schoonheid en functie — en soms naar een armatuur die nog niet bestaat.',
    'Every project starts with looking. Together with the client, the architect and the contractor we look for the balance between beauty and function — and sometimes for an armature that does not exist yet.'
  ),

  // Shown only when the interface language differs from the prose language.
  'note.en': L(
    'Deze tekst is alleen in het Engels beschikbaar.',
    'This text is only available in English.'
  ),
  'note.nl': L(
    'Deze tekst is alleen in het Nederlands beschikbaar.',
    'This text is only available in Dutch.'
  ),

  'footer.work': L('Werk', 'Work'),
  'footer.address': L('Adres', 'Address'),
  'footer.contact': L('Contact', 'Contact'),
  'footer.office': L('(kantoor)', '(office)'),

  'work.pageTitle': L('Werk — Paul van Laak', 'Work — Paul van Laak'),
  'work.heading': L('Werk.', 'Work.'),
  'work.intro': L(
    'Lichtontwerpen en lichtkunstwerken voor musea, tentoonstellingen, winkels, openbare ruimte, woonhuizen en theater.',
    'Light designs and light artworks for museums, exhibitions, shops, public space, private houses and theatre.'
  ),

  'home.pageTitle': L(
    'Paul van Laak — Lichtontwerp & Lichtkunst, Rotterdam',
    'Paul van Laak — Light design & Light art, Rotterdam'
  ),
  'home.heroSub': L(
    'Lichtontwerper en lichtarchitect. Atelier 81 — ontwerpbureau voor Licht & Enscenering, Rotterdam.',
    'Light designer and light architect. Atelier 81 — design office for Light & Staging, Rotterdam.'
  ),
  'home.heroCta': L('Bekijk werk', 'View work'),
  'home.introTitle': L('Licht staat<br>gelijk aan vuur.', 'Light is<br>equivalent to fire.'),
  'home.readMore': L('Lees meer', 'Read more'),
  'home.workHeading': L('Werk', 'Work'),
  'home.tileAllLabel': L('Alle projecten →', 'All projects →'),
  'home.tileAllTitle': L('Werk', 'Work'),
  'home.tileAllMeta': L('Het volledige overzicht', 'The complete overview'),
  'home.aboutHeading': L('Over Paul', 'About Paul'),
  'home.portraitCaption': L(
    'Paul van Laak — lichtontwerper & lichtarchitect',
    'Paul van Laak — light designer & light architect'
  ),
  'home.featuredHeading': L('Uitgelicht', 'Featured'),
  'home.statementHeading': L('Wat we doen.', 'What we do.'),
  'home.contactHeading': L('Contact', 'Contact'),
  'home.visit': L('Bezoek (op afspraak)', 'Visit (by appointment)'),
  'home.direct': L('Direct', 'Direct'),
};

for (const [key, value] of Object.entries(UI)) reg(key, value);

/* ------------------------------------------------------------------ data -- */

/**
 * One entry per project page.
 *
 *   dir        folder under work/ the page is written to
 *   proseLang  language of the source .txt — NOT the page language
 *   text       .txt the copy comes from (first line is dropped: it's the title)
 *   images     gallery, in order, as paths relative to the site root
 *   specs      the "Project" table — facts drawn from the copy only
 *
 * category / place / spec entries take L(nl, en) where the two differ and a
 * plain string where they don't (proper nouns, addresses, years).
 */
const PROJECTS = [
  {
    dir: 'bright-brussel',
    proseLang: 'nl',
    title: 'Sferen / Sphères',
    category: L('Lichtkunstwerk', 'Light artwork'),
    place: L('Brussel', 'Brussels'),
    text: 'work/bright-brussel/bb.txt',
    images: ['work/bright-brussel/bb1.avif', 'work/bright-brussel/bb2.avif', 'work/bright-brussel/bb3.avif'],
    specs: [
      [L('Opdracht', 'Commission'), 'Be Bright, Be Brussels'],
      [L('Locatie', 'Location'), L('Naamsepoort, Brussel (BE)', 'Naamsepoort, Brussels (BE)')],
      ['Discipline', L('Lichtkunstwerk', 'Light artwork')],
      [L('Samen met', 'Together with'), 'Arnout Meijer'],
      [L('In relatie tot', 'Relates to'), "'Signe de Lumière', Jacques Moeschal"],
    ],
  },
  {
    dir: 'object-o-amsterdam',
    proseLang: 'nl',
    title: 'Object O',
    category: L('Lichtkunstwerk, 2014', 'Light artwork, 2014'),
    place: 'Amsterdam',
    text: 'work/object-o-amsterdam/ooa.txt',
    images: ['work/object-o-amsterdam/ooa1.avif', 'work/object-o-amsterdam/ooa2.avif', 'work/object-o-amsterdam/ooa3.avif'],
    specs: [
      [L('Opdracht', 'Commission'), 'Amsterdam Light Festival'],
      [L('Locatie', 'Location'), 'Wertheimpark, Amsterdam'],
      [L('Jaar', 'Year'), '2014'],
      ['Discipline', L('Lichtkunstwerk', 'Light artwork')],
      [L('Samen met', 'Together with'), 'Arnout Meijer'],
    ],
  },
  {
    dir: 'object-o-sweden',
    proseLang: 'nl',
    title: 'Object O — Norrköping',
    category: L('Lichtkunstwerk, 2015', 'Light artwork, 2015'),
    place: L('Norrköping (ZW)', 'Norrköping (SE)'),
    text: 'work/object-o-sweden/oos.txt',
    images: ['work/object-o-sweden/oos1.avif'],
    specs: [
      [L('Opdracht', 'Commission'), 'Norrköping Light Festival'],
      [L('Locatie', 'Location'), L('Norrköping, Zweden', 'Norrköping, Sweden')],
      [L('Jaar', 'Year'), '2015'],
      ['Discipline', L('Lichtkunstwerk', 'Light artwork')],
      [L('Samen met', 'Together with'), 'Arnout Meijer'],
    ],
  },
  {
    dir: 'light-art-middenharnishof',
    proseLang: 'en',
    title: 'Light Art Middelharnishof',
    category: L('Lichtkunst', 'Light art'),
    place: 'Rotterdam',
    text: 'work/light-art-middenharnishof/lam.txt',
    images: [
      'work/light-art-middenharnishof/lam1.avif',
      'work/light-art-middenharnishof/lam2.avif',
      'work/light-art-middenharnishof/lam3.avif',
      'work/light-art-middenharnishof/lam4.avif',
    ],
    specs: [
      [L('Opdrachtgever', 'Client'), 'Woonstad Rotterdam'],
      [L('Locatie', 'Location'), 'Korpersteijn, Rotterdam Pendrecht'],
      [L('Architect', 'Architect'), 'A3 Architecten'],
      ['Discipline', L('Lichtobject', 'Light object')],
    ],
  },
  {
    dir: 'private-residence-rotterdam',
    proseLang: 'en',
    title: 'Private Residence Rotterdam',
    category: L('Lichtontwerp', 'Light design'),
    place: 'Rotterdam',
    text: 'work/private-residence-rotterdam/pra.txt',
    images: [
      'work/private-residence-rotterdam/prr1.avif',
      'work/private-residence-rotterdam/prr2.avif',
      'work/private-residence-rotterdam/prr3.avif',
      'work/private-residence-rotterdam/prr4.avif',
      'work/private-residence-rotterdam/prr5.avif',
      'work/private-residence-rotterdam/prr6.avif',
    ],
    specs: [
      [L('Locatie', 'Location'), L('Rotterdam centrum', 'Rotterdam city centre')],
      [L('Programma', 'Programme'), L('Privéwoning en B&B', 'Private residence and B&B')],
      ['Discipline', L('Lichtontwerp, interieur', 'Light design, interior')],
    ],
  },
  {
    dir: 'private-residence-rotterdam-II',
    proseLang: 'en',
    title: 'Private Residence Rotterdam II',
    category: L('Lichtontwerp, 2015', 'Light design, 2015'),
    place: 'Rotterdam',
    text: 'work/private-residence-rotterdam-II/prrII.txt',
    images: ['work/private-residence-rotterdam-II/prr7.avif', 'work/private-residence-rotterdam-II/prr8.avif'],
    specs: [
      [L('Locatie', 'Location'), L('Rotterdam centrum', 'Rotterdam city centre')],
      [L('Jaar', 'Year'), L('Opdracht eind 2015', 'Commissioned late 2015')],
      [L('Programma', 'Programme'), L('Twee monumentale panden — woonhuis en B&B', 'Two historical houses — residence and B&B')],
      ['Discipline', L('Lichtontwerp, custom armaturen', 'Light design, custom armatures')],
    ],
  },
  {
    dir: 'ourladyvirginII',
    proseLang: 'en',
    title: 'Our Lady Virgin II',
    category: L('Openbare verlichting', 'Public lighting'),
    place: 'Rotterdam',
    text: 'work/ourladyvirginII/olv2.txt',
    images: ['work/custom-made-2/olv1.avif', 'work/custom-made-2/olv2.avif', 'work/custom-made-2/olv3.avif'],
    specs: [
      [L('Locatie', 'Location'), L('MaHo-kwartier, Rotterdam centrum', 'MaHo quarter, Rotterdam city centre')],
      [L('Leverancier', 'Supplier'), 'CLS LED Technology, Wijchen (NL)'],
      [L('Stralingshoek', 'Beam angle'), L('12 graden', '12 degrees')],
      ['Discipline', L('Openbaar lichtontwerp', 'Public light design')],
    ],
  },
  {
    dir: 'custom-made-1',
    proseLang: 'en',
    title: 'Custom Made',
    category: L('Custom armaturen', 'Custom armatures'),
    place: 'Studio',
    text: 'work/custom-made-1/cm2.txt',
    images: [
      'work/custom-made-1/cm1.avif',
      'work/custom-made-1/cm2.avif',
      'work/custom-made-1/cm3.avif',
      'work/custom-made-1/cm4.avif',
      'work/custom-made-2/cm1.avif',
      'work/custom-made-2/cm2.avif',
      'work/custom-made-2/cm3.avif',
      'work/custom-made-2/cm4.avif',
      'work/custom-made-2/cm5.avif',
    ],
    specs: [
      ['Discipline', L('Custom made lichtoplossingen', 'Custom made light solutions')],
      [L('Materialen', 'Materials'), L('Staal, hout, glas, steen, beton', 'Steel, wood, glass, stone, concrete')],
      [L('Ook', 'Also'), L('Acrylsteen (HiMacs, Betacryl), transparant acryl', 'Acrylic stone (HiMacs, Betacryl), transparent acrylics')],
      [L('Gemaakt met', 'Made with'), L('Nederlandse productiepartners', 'Dutch production partners')],
    ],
  },
  {
    dir: 'astair',
    proseLang: 'en',
    title: 'ASTAIR',
    category: L('Custom armaturen', 'Custom armatures'),
    place: 'Rotterdam',
    text: 'work/astair/astair.txt',
    images: ['work/astair/astair1.avif'],
    specs: [
      [L('Locatie', 'Location'), 'De Rotterdam (Rem Koolhaas / OMA), Rotterdam'],
      [L('Programma', 'Programme'), L('Privé-appartement', 'Private apartment')],
      ['Product', L('RGB en wit, custom made lichttegels', 'RGB and white custom made light tiles')],
      [L('Materiaal', 'Material'), L('Dikke glazen bovenplaat', 'Heavy glass top')],
    ],
  },
  {
    dir: 'middelland-armatures',
    proseLang: 'en',
    title: 'Middelland Armatures',
    category: L('Openbare verlichting', 'Public lighting'),
    place: 'Rotterdam West',
    text: 'work/middelland-armatures/mla.txt',
    images: [
      'work/middelland-armatures/mla1.avif',
      'work/middelland-armatures/mla2.avif',
      'work/middelland-armatures/mla3.avif',
    ],
    specs: [
      [L('Opdrachtgever', 'Client'), 'BIZ Middelland'],
      [L('Locatie', 'Location'), 'Middellandstraat, Rotterdam West'],
      ['Discipline', L('Permanente straatarmaturen', 'Permanent street armatures')],
      [L('Referentie', 'Reference'), L('Art Deco, de M van Middelland', 'Art Deco, the M of Middelland')],
    ],
  },
  {
    dir: 'nieuwe-binnenweg',
    proseLang: 'en',
    title: 'Nieuwe Binnenweg',
    category: L('Openbare verlichting, 2021', 'Public lighting, 2021'),
    place: 'Rotterdam West',
    // The copy for this project sits in the (image-less) nieuw-lichtwerk-brussels folder.
    text: 'work/nieuw-lichtwerk-brussels/nb.txt',
    images: ['work/nieuwe-binnenweg/nb1.avif', 'work/nieuwe-binnenweg/nb2.avif', 'work/nieuwe-binnenweg/nb3.avif'],
    specs: [
      [L('Locatie', 'Location'), 'Nieuwe Binnenweg, Rotterdam West'],
      [L('Geïnstalleerd', 'Installed'), L('Eind 2021', 'Late 2021')],
      ['Discipline', L('Permanente straatarmaturen', 'Permanent street armatures')],
      [L('Vervolg op', 'Sequel to'), 'Middelland Armatures'],
    ],
  },
  {
    dir: 'old-city-center',
    proseLang: 'en',
    title: 'Season Light Objects Old City Centre',
    category: L('Seizoensverlichting', 'Seasonal lighting'),
    place: 'Rotterdam',
    text: 'work/old-city-center/occ.txt',
    images: ['work/old-city-center/occ1.avif', 'work/old-city-center/occ2.avif', 'work/old-city-center/occ3.avif'],
    specs: [
      [L('Opdrachtgever', 'Client'), 'BIZ Oude Binnenweg'],
      [L('Locatie', 'Location'), 'Oude Binnenweg, Rotterdam'],
      [L('Te zien', 'On show'), L('Eind oktober tot begin april', 'End of October until the beginning of April')],
      [L('In relatie tot', 'Relates to'), "'Santa Claus', Paul McCarthy"],
    ],
  },
  {
    dir: 'louve-interior',
    proseLang: 'en',
    title: 'LOUVE Interior',
    category: L('Winkel, 2012', 'Retail, 2012'),
    place: 'Rotterdam',
    text: 'work/louve-interior/li.txt',
    images: ['work/louve-interior/li1.avif', 'work/louve-interior/li2.avif'],
    specs: [
      [L('Opdrachtgever', 'Client'), 'LOUVE lingerie'],
      [L('Locatie', 'Location'), 'Rotterdam'],
      [L('Jaar', 'Year'), '2012'],
      ['Discipline', L('Interieurontwerp en lichtontwerp', 'Interior design and light design')],
      [L('Pers', 'Press'), 'Marie Claire, LINDA'],
    ],
  },
  {
    dir: 'wildhandel-treuren',
    proseLang: 'nl',
    title: 'Belichting Wildhandel Treuren',
    category: L('Winkel, 2013', 'Retail, 2013'),
    place: 'Rotterdam',
    text: 'work/wildhandel-treuren/bwt.txt',
    images: ['work/wildhandel-treuren/wt1.avif', 'work/wildhandel-treuren/wt2.avif'],
    specs: [
      [L('Opdrachtgever', 'Client'), 'Wildhandel Treuren'],
      [L('Locatie', 'Location'), 'Jonker Fransstraat 61-63, Rotterdam'],
      [L('Jaar', 'Year'), '2013'],
      ['Discipline', L('Lichtplan, interieuradvies', 'Light plan, interior advice')],
    ],
  },
  {
    dir: 'woonhut-ziegler',
    proseLang: 'nl',
    title: 'Woonhuis Ziegler | Branderhorst',
    category: L('Woonhuis, 2013', 'Private house, 2013'),
    place: 'Rotterdam Overschie',
    text: 'work/woonhut-ziegler/wz.txt',
    // The one photo of this project sits in the the-blue-revolution folder.
    images: ['work/the-blue-revolution/wz1.avif'],
    specs: [
      [L('Architect', 'Architect'), 'Franz Ziegler, Ziegler | Branderhorst'],
      [L('Locatie', 'Location'), 'Overschie, Rotterdam'],
      [L('Jaar', 'Year'), '2013'],
      ['Discipline', L('Theatraal lichtontwerp, monument', 'Theatrical light design, listed building')],
      [L('Fotografie', 'Photography'), 'Thijs Wolzak (NRC)'],
    ],
  },
  {
    dir: 'thomas-moore-college',
    proseLang: 'nl',
    title: 'Thomas Moore College / PABO',
    category: L('Onderwijs, 2014', 'Education, 2014'),
    place: 'Rotterdam',
    text: 'work/thomas-moore-college/tmc.txt',
    images: ['work/thomas-moore-college/tmc1.avif'],
    specs: [
      [L('Architect', 'Architect'), 'Franz Ziegler'],
      [L('Locatie', 'Location'), 'Thomas Moore College, Rotterdam'],
      [L('Jaar', 'Year'), '2014'],
      ['Discipline', L('Lichtontwerp, neon-installatie', 'Light design, neon installation')],
      [L('Tekst', 'Text'), '"Many are schooled but few are educated"'],
    ],
  },
  {
    dir: 'villa-zebra',
    proseLang: 'en',
    title: 'Children’s Museum Villa Zebra',
    category: L('Tentoonstelling, 2016', 'Exhibition, 2016'),
    place: 'Rotterdam',
    text: 'work/villa-zebra/vz.txt',
    images: [
      'work/villa-zebra/vz1.avif',
      'work/villa-zebra/vz2.avif',
      'work/villa-zebra/vz3.avif',
      'work/villa-zebra/vz4.avif',
    ],
    specs: [
      [L('Opdrachtgever', 'Client'), 'Villa Zebra, Rotterdam'],
      [L('Tentoonstelling', 'Exhibition'), "'Diep in het Bos' (Deep into the Woods)"],
      [L('Geopend', 'Opened'), L('9 december 2016', '9 December 2016')],
      ['Discipline', L('Lichtontwerp en lichtinstallatie', 'Exhibition light design and light installation')],
    ],
  },
  {
    dir: 'ja-gem-denhaag',
    proseLang: 'nl',
    title: 'Ja, Natuurlijk — GEM Den Haag',
    category: L('Tentoonstelling, 2012', 'Exhibition, 2012'),
    place: L('Den Haag', 'The Hague'),
    text: 'work/ja-gem-denhaag/ja.txt',
    images: ['work/ja-gem-denhaag/gem1.avif'],
    specs: [
      [L('Opdrachtgever', 'Client'), 'Stichting Niet Normaal / Ine Gevers'],
      [L('Locatie', 'Location'), L('GEM, Museum voor Actuele Kunst, Den Haag', 'GEM, Museum of Contemporary Art, The Hague')],
      [L('Opening', 'Opening'), L('23 augustus 2012', '23 August 2012')],
      [L('Curator', 'Curator'), 'Ine Gevers'],
      ['Discipline', L('Lichtplan tentoonstelling', 'Exhibition light plan')],
    ],
  },
  {
    dir: 'the-blue-revolution',
    proseLang: 'nl',
    title: 'The Blue Revolution',
    category: L('Tentoonstelling, 2013', 'Exhibition, 2013'),
    place: 'Delft',
    text: 'work/the-blue-revolution/tbr.txt',
    images: [
      'work/the-blue-revolution/br1.avif',
      'work/the-blue-revolution/br2.avif',
      'work/the-blue-revolution/br3.avif',
    ],
    specs: [
      [L('Locatie', 'Location'), 'Museum Prinsenhof, Delft'],
      [L('Jaar', 'Year'), '2013'],
      ['Project', L('Uitwisseling Nederland — Dongguan (CN)', 'Exchange Netherlands — Dongguan (CN)')],
      ['Discipline', L('Lichtontwerp tentoonstelling', 'Exhibition light design')],
    ],
  },
  {
    dir: 'raw-art-fair',
    proseLang: 'nl',
    title: 'RAW Art Fair 2013',
    category: L('Kunstbeurs, 2013', 'Art fair, 2013'),
    place: 'Rotterdam',
    text: 'work/raw-art-fair/raf.txt',
    images: ['work/raw-art-fair/raf1.avif', 'work/raw-art-fair/raf2.avif', 'work/raw-art-fair/raf3.avif'],
    specs: [
      [L('Opdrachtgever', 'Client'), 'RAW Art Fair'],
      [L('Locatie', 'Location'), L('Negentiende-eeuws pakhuis, Rotterdam', 'Nineteenth-century warehouse, Rotterdam')],
      [L('Jaar', 'Year'), '2013'],
      ['Discipline', L('Lichtontwerp kunstbeurs', 'Art fair light design')],
    ],
  },
  {
    dir: 'new-amsterdam-apartment',
    proseLang: 'en',
    title: 'New Amsterdam Apartment',
    category: L('Lichtontwerp, 2017', 'Light design, 2017'),
    place: 'Amsterdam',
    text: 'work/new-amsterdam-apartment/naa.txt',
    images: ['work/new-amsterdam-apartment/naa1.avif'],
    specs: [
      [L('Locatie', 'Location'), 'Houthavens, Amsterdam'],
      ['Status', L('Artist impression — fotografie verwacht voorjaar 2017', 'Artist impression — photography expected Spring 2017')],
      ['Discipline', L('Lichtontwerp', 'Light design')],
    ],
  },
  {
    dir: 'onafhankelijk-toneel',
    proseLang: 'nl',
    title: 'Onafhankelijk Toneel',
    category: L('Theater', 'Theatre'),
    place: 'Rotterdam',
    // No .txt was supplied for this project; the lead below is drawn from bio.txt
    // and from the Woonhuis Ziegler copy. Replace `lead` with the real text.
    lead:
      'Paul van Laak werkte ruim 25 jaar voor opera-, theater- en dansproducties, ' +
      'waaronder jarenlang voor het Onafhankelijk Toneel in Rotterdam. Die theatrale ' +
      'blik op licht — effect, techniek en sfeer — ligt onder al het latere werk voor ' +
      'architectuur, musea en interieurs.',
    images: ['work/ja-gem-denhaag/ot1.avif'],
    specs: [
      [L('Gezelschap', 'Company'), 'Onafhankelijk Toneel, Rotterdam'],
      ['Discipline', L('Theaterlichtontwerp', 'Theatre light design')],
    ],
  },
];

/* Register the per-project metadata so it lands in nl.json / en.json too. */
const pk = (dir, rest) => `project.${dir}.${rest}`;
for (const p of PROJECTS) {
  reg(pk(p.dir, 'category'), p.category);
  reg(pk(p.dir, 'place'), p.place);
  p.specs.forEach(([label, value], i) => {
    reg(pk(p.dir, `spec.${i}.label`), label);
    reg(pk(p.dir, `spec.${i}.value`), value);
  });
}

reg('home.tileAllLabel', L(`Alle ${PROJECTS.length} projecten →`, `All ${PROJECTS.length} projects →`));
reg('work.count', L(`${PROJECTS.length} projecten`, `${PROJECTS.length} projects`));

/**
 * Fingerprint of the dictionary. Embedded in every page and used as part of
 * the localStorage cache key, so a rebuild that changes a string invalidates
 * the cached copy in people's browsers — but an unrelated rebuild does not.
 */
const I18N_VERSION = crypto
  .createHash('sha1')
  .update(JSON.stringify(STRINGS))
  .digest('hex')
  .slice(0, 8);

/* ------------------------------------------------------------- utilities -- */

/** Turn a bare URL in body copy into a link. */
const linkify = (s) =>
  s.replace(/(https?:\/\/[^\s<]+[^\s<.,)])/g, '<a class="inline-link" href="$1" target="_blank" rel="noopener">$1</a>');

/**
 * Read a project .txt file and return its body paragraphs.
 * The first line is the heading in every source file, so it is dropped.
 */
function readCopy(relPath) {
  const raw = fs.readFileSync(path.join(ROOT, relPath), 'utf8').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const firstContent = lines.findIndex((l) => l.trim() !== '');
  return paragraphs(lines.slice(firstContent + 1).join('\n'));
}

/** Blank line = paragraph break; single newlines are soft wraps. */
function paragraphs(raw) {
  return raw
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => l.trim()).join(' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);
}

/** Collapse a paragraph into a <meta name="description"> value. */
function summarise(text, max = 155) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, clean.lastIndexOf(' ', max - 1)).replace(/[,;:.]$/, '') + '…';
}

/** The "only available in X" line, shown when the UI language differs. */
const langNote = (proseLang, indent = '          ') =>
  `${indent}<p class="lang-note" data-prose-lang="${proseLang}"${A(`note.${proseLang}`)}>${V(`note.${proseLang}`)}</p>`;

/* ------------------------------------------------------------- fragments -- */

function header(root) {
  return `  <a class="announce" href="${root}index.html#contact"${A('announce')}>${V('announce')}</a>

  <header class="site-header" id="top">
    <a class="logo" href="${root}index.html">Paul van Laak</a>

    <nav class="main-nav" id="main-nav"${AT('aria-label', 'nav.aria')}>
      <a href="${root}work/index.html"${A('nav.work')}>${V('nav.work')}</a>
      <a href="${root}index.html#over"${A('nav.about')}>${V('nav.about')}</a>
      <a href="${root}index.html#contact"${A('nav.contact')}>${V('nav.contact')}</a>
    </nav>

    <div class="header-tools">
      <div class="lang-switch" role="group"${AT('aria-label', 'lang.aria')}>
        <button class="lang-btn" type="button" data-lang-set="nl" aria-pressed="true" lang="nl">NL</button>
        <span class="lang-sep" aria-hidden="true">/</span>
        <button class="lang-btn" type="button" data-lang-set="en" aria-pressed="false" lang="en">EN</button>
      </div>
      <button class="menu-btn" type="button" id="menu-btn" aria-expanded="false" aria-controls="main-nav"${A('nav.menu')}>${V('nav.menu')}</button>
    </div>
  </header>`;
}

function footer(root) {
  return `  <footer class="site-footer">
    <a class="footer-brand" href="${root}index.html">
      <img class="logo-mark" src="${root}assets/a81-logo.avif" alt="Atelier 81 — Architecture by Light" width="518" height="184" loading="lazy">
    </a>

    <div class="footer-cols">
      <div>
        <h3${A('footer.work')}>${V('footer.work')}</h3>
        <a href="${root}work/index.html"${A('cta.allWork')}>${V('cta.allWork')}</a>
        <a href="${root}index.html#over"${A('nav.about')}>${V('nav.about')}</a>
        <a href="${root}index.html#contact"${A('nav.contact')}>${V('nav.contact')}</a>
      </div>
      <div>
        <h3${A('footer.address')}>${V('footer.address')}</h3>
        <span class="footer-line">De Kroon Office (1st floor)</span>
        <span class="footer-line">Schiemond 20-22</span>
        <span class="footer-line">NL-3024 EE Rotterdam</span>
      </div>
      <div>
        <h3${A('footer.contact')}>${V('footer.contact')}</h3>
        <a href="mailto:paul@atelier81.nl">paul@atelier81.nl</a>
        <a href="tel:+31641316506">+31 (0)6 41316506</a>
        <a href="tel:+31108416393">+31 (0)10 8416393</a>
      </div>
    </div>
    <p class="legal">© <span data-year>2026</span> Paul van Laak — Atelier 81</p>
  </footer>`;
}

/** The category — place line, in two swappable halves. */
function metaLine(project) {
  return `<span${A(pk(project.dir, 'category'))}>${V(pk(project.dir, 'category'))}</span> — <span${A(pk(project.dir, 'place'))}>${V(pk(project.dir, 'place'))}</span>`;
}

function tile(project, root) {
  return `        <a class="tile" href="${root}work/${project.dir}/index.html">
          <div class="tile-img"><img src="${root}${project.images[0]}" alt="${esc(project.title)}" loading="lazy"></div>
          <span class="tile-title">${esc(project.title)}</span>
          <span class="tile-meta">${metaLine(project)}</span>
        </a>`;
}

/**
 * Scroll-snap carousel. Works without JS (it is just a horizontal scroller);
 * script.js upgrades it with arrows, a counter and dots.
 */
function carousel(project, root) {
  const n = project.images.length;

  const slides = project.images
    .map(
      (src, i) => `            <figure class="carousel-slide" role="group"${AT('aria-roledescription', 'carousel.slide')} aria-label="${i + 1} / ${n}">
              <img src="${root}${src}" alt="${esc(project.title)} — ${i + 1}/${n}"${i === 0 ? '' : ' loading="lazy"'}>
            </figure>`
    )
    .join('\n');

  if (n === 1) {
    return `        <div class="carousel carousel-single">
          <div class="carousel-viewport">
${slides}
          </div>
        </div>`;
  }

  const dots = project.images
    .map((_, i) => `            <button type="button" data-carousel-dot="${i}" aria-current="${i === 0}" aria-label="${i + 1} / ${n}"></button>`)
    .join('\n');

  return `        <div class="carousel" data-carousel role="group"${AT('aria-roledescription', 'carousel.aria')} aria-label="${esc(project.title)}">
          <div class="carousel-viewport" data-carousel-track tabindex="0"${AT('aria-label', 'carousel.photos')}>
${slides}
          </div>
          <button class="carousel-btn carousel-prev" type="button" data-carousel-prev${AT('aria-label', 'carousel.prev')}>&#8592;</button>
          <button class="carousel-btn carousel-next" type="button" data-carousel-next${AT('aria-label', 'carousel.next')}>&#8594;</button>
          <p class="carousel-count" data-carousel-count aria-live="polite">1 / ${n}</p>
          <div class="carousel-dots" data-carousel-dots>
${dots}
          </div>
        </div>`;
}

function page({ title, titleKey, description, body, root }) {
  const titleAttr = titleKey ? A(titleKey) : '';
  return `<!doctype html>
<html lang="${DEFAULT_LANG}" data-lang="${DEFAULT_LANG}" data-i18n-base="${root}i18n/" data-i18n-v="${I18N_VERSION}" data-lang-default="${DEFAULT_LANG}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title${titleAttr}>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <script>(function(){var d=document.documentElement;d.className+=' js';try{var l=localStorage.getItem('pvl-lang');if(l==='en'||l==='nl'){d.lang=l;d.setAttribute('data-lang',l);}}catch(e){}})();</script>
  <link rel="stylesheet" href="${root}css/style.css">
  <script src="${root}js/script.js" defer></script>
</head>
<body>

${body}

</body>
</html>
`;
}

/* ------------------------------------------------------- detail page --- */

function detailPage(project, index) {
  const root = '../../';
  const copy = project.text ? readCopy(project.text) : [];
  const lead = project.lead || copy[0] || '';
  const rest = project.lead ? copy : copy.slice(1);

  const specs = project.specs
    .map(
      (_, i) => `            <div class="spec">
              <dt${A(pk(project.dir, `spec.${i}.label`))}>${V(pk(project.dir, `spec.${i}.label`))}</dt>
              <dd${A(pk(project.dir, `spec.${i}.value`))}>${V(pk(project.dir, `spec.${i}.value`))}</dd>
            </div>`
    )
    .join('\n');

  const related = [1, 2, 3]
    .map((offset) => PROJECTS[(index + offset) % PROJECTS.length])
    .map((p) => tile(p, root))
    .join('\n');

  const bodyCopy = rest.map((p) => `\n            <p>${linkify(esc(p))}</p>`).join('');

  const body = `${header(root)}

  <main>

    <nav class="crumbs"${AT('aria-label', 'crumb.aria')}>
      <a href="${root}index.html"${A('crumb.home')}>${V('crumb.home')}</a>
      <span aria-hidden="true">/</span>
      <a href="${root}work/index.html"${A('nav.work')}>${V('nav.work')}</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">${esc(project.title)}</span>
    </nav>

    <section class="pdp">
      <div class="pdp-gallery">
${carousel(project, root)}
      </div>

      <div class="pdp-info">
        <div class="pdp-info-inner">
          <p class="pdp-eyebrow">${metaLine(project)}</p>
          <h1>${esc(project.title)}</h1>

          <div class="pdp-copy" lang="${project.proseLang}">
${langNote(project.proseLang, '            ')}
            <p class="pdp-lead">${linkify(esc(lead))}</p>${bodyCopy}
          </div>

          <div class="pdp-actions">
            <a class="btn" href="${root}index.html#contact"${A('cta.contact')}>${V('cta.contact')}</a>
            <a class="link" href="${root}work/index.html"${A('cta.allWork')}>${V('cta.allWork')}</a>
          </div>

          <div class="pdp-specs">
            <h3${A('pdp.specs')}>${V('pdp.specs')}</h3>
            <dl>
${specs}
            </dl>
          </div>
        </div>
      </div>
    </section>

    <section class="help">
      <h2 data-i18n-html="help.title">${VH('help.title')}</h2>
      <p${A('help.body')}>${V('help.body')}</p>
      <a class="btn" href="${root}index.html#contact"${A('cta.contact')}>${V('cta.contact')}</a>
    </section>

    <section class="work more-work">
      <div class="section-head">
        <h2${A('pdp.moreWork')}>${V('pdp.moreWork')}</h2>
        <div class="rail-controls">
          <button type="button" data-rail-prev${AT('aria-label', 'rail.prev')}>←</button>
          <button type="button" data-rail-next${AT('aria-label', 'rail.next')}>→</button>
        </div>
      </div>
      <div class="rail" data-rail>
${related}
      </div>
    </section>

  </main>

${footer(root)}`;

  return page({
    title: `${project.title} — Paul van Laak`,
    description: summarise(lead),
    body,
    root,
  });
}

/* ------------------------------------------------------ overview page --- */

function overviewPage() {
  const root = '../';

  const cards = PROJECTS.map(
    (p) => `        <a class="card" href="${root}work/${p.dir}/index.html">
          <div class="card-img"><img src="${root}${p.images[0]}" alt="${esc(p.title)}" loading="lazy"></div>
          <span class="card-title">${esc(p.title)}</span>
          <span class="card-meta">${metaLine(p)}</span>
        </a>`
  ).join('\n');

  const body = `${header(root)}

  <main>

    <section class="page-head">
      <p class="pdp-eyebrow"${A('work.count')}>${V('work.count')}</p>
      <h1${A('work.heading')}>${V('work.heading')}</h1>
      <p class="page-intro"${A('work.intro')}>${V('work.intro')}</p>
    </section>

    <section class="featured">
      <div class="grid grid-work">
${cards}
      </div>
    </section>

    <section class="help">
      <h2 data-i18n-html="help.title">${VH('help.title')}</h2>
      <p${A('help.body')}>${V('help.body')}</p>
      <a class="btn" href="${root}index.html#contact"${A('cta.contact')}>${V('cta.contact')}</a>
    </section>

  </main>

${footer(root)}`;

  return page({
    title: STRINGS['work.pageTitle'].nl,
    titleKey: 'work.pageTitle',
    description:
      'Alle projecten van lichtontwerper Paul van Laak / Atelier 81: lichtkunstwerken, tentoonstellingen, winkelconcepten, openbare verlichting en woonhuizen.',
    body,
    root,
  });
}

/* ---------------------------------------------------------- home page --- */

function homePage() {
  const root = '';

  const bio = fs.readFileSync(path.join(ROOT, 'bio.txt'), 'utf8').trim();
  const about = fs.readFileSync(path.join(ROOT, 'aboutus.txt'), 'utf8').trim();

  // aboutus.txt keeps one paragraph per line; bio.txt soft-wraps inside paragraphs.
  const aboutParas = about
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(1); // drop the "What we do" heading

  const bioParas = paragraphs(bio)
    .slice(1) // drop the "Paul van Laak" heading
    .filter((p) => !/^(You can contact|or \+31)/.test(p)); // contact details live in the contact block

  const railSlugs = [
    'bright-brussel',
    'object-o-amsterdam',
    'private-residence-rotterdam',
    'villa-zebra',
    'middelland-armatures',
    'louve-interior',
    'astair',
    'the-blue-revolution',
  ];
  const rail = railSlugs
    .map((slug) => PROJECTS.find((p) => p.dir === slug))
    .map((p) => tile(p, root))
    .join('\n');

  const featuredSlugs = ['light-art-middenharnishof', 'thomas-moore-college', 'old-city-center'];
  const featured = featuredSlugs
    .map((slug) => PROJECTS.find((p) => p.dir === slug))
    .map(
      (p) => `        <a class="card" href="work/${p.dir}/index.html">
          <div class="card-img"><img src="${p.images[0]}" alt="${esc(p.title)}" loading="lazy"></div>
          <span class="card-title">${esc(p.title)}</span>
          <span class="card-meta">${metaLine(p)}</span>
        </a>`
    )
    .join('\n');

  const body = `${header(root)}

  <main>

    <section class="hero">
      <div class="hero-media">
        <img src="work/object-o-amsterdam/ooa1.avif" alt="Object O, Amsterdam Light Festival">
      </div>
      <div class="hero-copy">
        <h1>Paul van Laak.</h1>
        <p class="hero-sub"${A('home.heroSub')}>${V('home.heroSub')}</p>
        <a class="btn" href="work/index.html"${A('home.heroCta')}>${V('home.heroCta')}</a>
      </div>
    </section>

    <section class="intro">
      <h2 data-i18n-html="home.introTitle">${VH('home.introTitle')}</h2>
      <div class="intro-body" lang="en">
        <p>${esc(aboutParas[0])}</p>
        <a class="link" href="#over"${A('home.readMore')}>${V('home.readMore')}</a>
      </div>
    </section>

    <section class="work" id="werk">
      <div class="section-head">
        <h2${A('home.workHeading')}>${V('home.workHeading')}</h2>
        <div class="rail-controls">
          <button type="button" data-rail-prev${AT('aria-label', 'rail.prev')}>←</button>
          <button type="button" data-rail-next${AT('aria-label', 'rail.next')}>→</button>
        </div>
      </div>

      <div class="rail" data-rail>
${rail}
        <a class="tile tile-all" href="work/index.html">
          <div class="tile-img tile-all-img"><span${A('home.tileAllLabel')}>${V('home.tileAllLabel')}</span></div>
          <span class="tile-title"${A('home.tileAllTitle')}>${V('home.tileAllTitle')}</span>
          <span class="tile-meta"${A('home.tileAllMeta')}>${V('home.tileAllMeta')}</span>
        </a>
      </div>
    </section>

    <section class="about split" id="over">
      <figure class="about-portrait">
        <img src="assets/Paul-van-laak-Lichtontwerp-scaled.avif" alt="Portret van Paul van Laak" width="360" height="360" loading="lazy">
        <figcaption${A('home.portraitCaption')}>${V('home.portraitCaption')}</figcaption>
      </figure>
      <div class="split-copy">
        <img class="logo-mark about-logo" src="assets/a81-logo.avif" alt="Atelier 81 — Architecture by Light" width="518" height="184" loading="lazy">
        <h2${A('home.aboutHeading')}>${V('home.aboutHeading')}</h2>
        <div lang="en">
${langNote('en', '        ')}
${bioParas.map((l) => `        <p>${esc(l)}</p>`).join('\n')}
        </div>
        <a class="link" href="#contact"${A('cta.contact')}>${V('cta.contact')}</a>
      </div>
    </section>

    <section class="featured" id="uitgelicht">
      <div class="section-head">
        <h2${A('home.featuredHeading')}>${V('home.featuredHeading')}</h2>
        <a class="link" href="work/index.html"${A('cta.allWork')}>${V('cta.allWork')}</a>
      </div>
      <div class="grid">
${featured}
      </div>
    </section>

    <section class="statement">
      <h2${A('home.statementHeading')}>${V('home.statementHeading')}</h2>
${langNote('en', '      ')}
      <div class="statement-body" lang="en">
${aboutParas
  .slice(1)
  .map((l) => `        <p>${esc(l)}</p>`)
  .join('\n')}
      </div>
    </section>

    <section class="contact" id="contact">
      <h2${A('home.contactHeading')}>${V('home.contactHeading')}</h2>
      <div class="contact-cols">
        <div>
          <h3${A('home.visit')}>${V('home.visit')}</h3>
          <p>De Kroon Office (1st floor)<br>Schiemond 20-22<br>NL-3024 EE Rotterdam<br>The Netherlands</p>
        </div>
        <div>
          <h3${A('home.direct')}>${V('home.direct')}</h3>
          <p>
            <a class="inline-link" href="mailto:paul@atelier81.nl">paul@atelier81.nl</a><br>
            <a class="inline-link" href="tel:+31641316506">+31 (0)6 41316506</a><br>
            <a class="inline-link" href="tel:+31108416393">+31 (0)10 8416393</a> <span${A('footer.office')}>${V('footer.office')}</span>
          </p>
        </div>
      </div>
    </section>

  </main>

${footer(root)}`;

  return page({
    title: STRINGS['home.pageTitle'].nl,
    titleKey: 'home.pageTitle',
    description:
      'Paul van Laak is lichtontwerper en lichtarchitect bij Atelier 81 in Rotterdam. Lichtontwerpen voor musea, tentoonstellingen, winkelconcepten, woonhuizen en openbare ruimte.',
    body,
    root,
  });
}

/* ------------------------------------------------------------------ run -- */

for (const [i, project] of PROJECTS.entries()) {
  const dir = path.join(ROOT, 'work', project.dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), detailPage(project, i));
}

fs.writeFileSync(path.join(ROOT, 'work', 'index.html'), overviewPage());
fs.writeFileSync(path.join(ROOT, 'index.html'), homePage());

fs.mkdirSync(path.join(ROOT, 'i18n'), { recursive: true });
for (const lang of LANGS) {
  const dict = {};
  for (const key of Object.keys(STRINGS).sort()) dict[key] = STRINGS[key][lang];
  fs.writeFileSync(path.join(ROOT, 'i18n', `${lang}.json`), JSON.stringify(dict, null, 2) + '\n');
}

console.log(
  `Wrote ${PROJECTS.length} project pages, work/index.html, index.html and ` +
    `i18n/{${LANGS.join(',')}}.json — ${Object.keys(STRINGS).length} keys, version ${I18N_VERSION}.`
);
