/**
 * The dogs the Foundation report is about.
 *
 * The desktop application takes this list from the user — any dogs they care about. A
 * public page cannot ask, so the site carries one list: the Japanese exports that founded
 * the breed outside Japan, as kept in the documentation hub
 * (`_General Specifications/foundation-japanese-spitz-exports.txt`, 61 names). Owner
 * decision, 2026-09-11.
 *
 * To change the list, edit this file. Every foundation report is recomputed at the next
 * publish, and a name that does not match a record in the master is reported by the
 * publish run rather than silently shown as absent from every pedigree.
 *
 * Names are matched the way the database matches them: trimmed, case-insensitive. This
 * list and the hub file are identical: eight names were corrected in both (six on 2026-09-11,
 * two on 2026-09-12 after the owner's data cleanup) to the catalogue's spelling, WHITE JOANNA
 * OF MOON LIGHT was removed on 2026-09-12 and restored on 2026-09-28 after the owner's
 * research, when the list was re-synced to the hub file (registry suffix `JP`/`FCI`; for OSTARA the birth-year
 * disambiguator the catalogue adds to a shared name).
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

export const FOUNDATION_DOGS: readonly string[] = [
  'ACCEL OF GOD MOUNT JP',
  'ADELA OF AMAGE',
  'AGREE OF SENBON MATSUBARASOW',
  'ALBARES CARP OF NEDORY',
  'ALBERT OF LOVELY',
  'ALEX OF GOLDEN MEADOW',
  'ALICE OF AMAGE',
  'ANDOLEASON OF GOLDEN MEADOW',
  'ASAGI OF TOYOSHI HAKUREN JP',
  'ASTER OF MONAMI FUJINOMIYA',
  'ATHENA LEILANI OF ALOHA LAND',
  'AXEL OF KOBE MANAMISOW',
  'BILKE OF SUMMIT FIELD',
  'BOBY OF KOZA LAND JP',
  'BRANLY OF CASABLANCA TOMO JP',
  'BULLET FANCY OF NEDORY',
  'DANIEL OF ROSE GARDEN',
  'DICK OF NADESHIKO LAND',
  'EREN HOF BRUGA FCI',
  'EREN HOF FUDZIAMA SAN VOM ROLLENDEN HAUS',
  'EREN HOF FUJIYAMA FCI',
  'EREN HOF HAMAHIME FCI',
  'EREN HOF HANKU FCI',
  'EREN HOF SAKURA FCI',
  'FLORENCE OF ROSE GARDEN',
  'FUJI OF OYAMA YAMAMOTOSOW',
  'FUJIKO OF WHITE KODAMASOW',
  'FUJIMILAND BABY RAMALE',
  'GAIA OF TAMANA ARIAKESOW',
  'GÖTTER-MAHLS SHANSHAN',
  'GRADICE OF HOUSE CACTUS',
  'HANNAH OF TAMANA ARIAKESOW',
  'HARRY OF TAMANA ARIAKESOW',
  'HAWK OF KAGETSU LAND',
  'HOVER OF KAGETSU LAND',
  'I.F. BIRDIE OF TAMANA ARIAKESOW',
  'IDOL OF NADESHIKO LAND',
  'IKAR OF HONDASOW JP',
  'JIN-CHERRY JP EMILY',
  'JINGLE BELL OF HARIMA TAKEDA',
  'KIKUCHIYO OF SHONAN SUMIRESOW JP',
  'KOTOHIME OF SHONAN SUMIRESOW JP',
  'LAPISLAZULI OF SYLPH SATO',
  'MASAMITSU OF YOKOHAMA MURATA JP',
  'MILLION STEEPS WHITE CHOUCHOU FCI',
  'NAOMI OF KONPARU WAKATA JP',
  'NEW TOKYO KENNEL\'S JODDY',
  'ORANGE HILL JP DORIS',
  'OSTARA OF M. EARLY SUMMER JP (2002)',
  'PRIZE OF MATSUSHIMOSATO JP',
  'RYUUCHI OF MARUKO NOMURA JP',
  'SABINA OF MOONLIGHT',
  'SHIRAYUKI OF TOKYO SEIZANSOW',
  'SHONAN SUMIRESOW JP SAYAKO',
  'SPITZ PARADISE ANGEL AKI',
  'SPITZ PARADISE ANGEL MITO',
  'TAKE MARU OF YOKOHAMA TAKADA',
  'TAKE OH OF YOKOHAMA TAKADA',
  'WHITE CHERRY II OF TOKYO WASHINGTON',
  'WHITE JOANNA OF MOON LIGHT',
  'WHITE PEARL OF LONE HILL',
];
