/**
 * The dogs the Foundation report is about.
 *
 * The desktop application takes this list from the user — any dogs they care about. A
 * public page cannot ask, so the site carries one list: the Japanese exports that founded
 * the breed outside Japan, as kept in the documentation hub
 * (`_General Specifications/foundation-japanese-spitz-exports.txt`, 55 names). Owner
 * decision, 2026-09-11.
 *
 * To change the list, edit this file. Every foundation report is recomputed at the next
 * publish, and a name that does not match a record in the master is reported by the
 * publish run rather than silently shown as absent from every pedigree.
 *
 * Names are matched the way the database matches them: trimmed, case-insensitive. This
 * list and the hub file are identical: six names were corrected in both on 2026-09-11 to
 * the catalogue's spelling (registry suffix `JP`/`FCI`; for OSTARA the birth-year
 * disambiguator the catalogue adds to a shared name).
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

export const FOUNDATION_DOGS: readonly string[] = [
  'SABINA OF MOONLIGHT',
  'DANIEL OF ROSE GARDEN',
  'ANDOLEASON OF GOLDEN MEADOW',
  'GÖTTER-MAHLS SHANSHAN',
  'GRADICE OF HOUSE CACTUS',
  'ATHENA LEILANI OF ALOHA LAND',
  'WHITE PEARL OF LONE HILL',
  'ALBARES CARP OF NEDORY',
  'ALBERT OF LOVELY',
  'BULLET FANCY OF NEDORY',
  'I.F. BIRDIE OF TAMANA ARIAKESOW',
  'DICK OF NADESHIKO LAND',
  'BILKE OF SUMMIT FIELD',
  'HAWK OF KAGETSU LAND',
  'HOVER OF KAGETSU LAND',
  'ADELA OF AMAGE',
  'ALICE OF AMAGE',
  'FLORENCE OF ROSE GARDEN',
  'FUJIMILAND BABY RAMALE',
  'WHITE JOANNA OF MOON LIGHT',
  'GAIA OF TAMANA ARIAKESOW',
  'HANNAH OF TAMANA ARIAKESOW',
  'HARRY OF TAMANA ARIAKESOW',
  'AXEL OF KOBE MANAMISOW',
  'ALEX OF GOLDEN MEADOW',
  'FUJI OF OYAMA YAMAMOTOSOW',
  'JINGLE BELL OF HARIMA TAKEDA',
  'IDOL OF NADESHIKO LAND',
  'SHIRAYUKI OF TOKYO SEIZANSOW',
  'AGREE OF SENBON MATSUBARASOW',
  'TAKE OH OF YOKAHAMA TAKADA',
  'FUJIKO OF WHITE KODAMASOW',
  'MASAMITSU OF YOKOHAMA MURATA JP',
  'BOBY OF KOZA LAND JP',
  'EREN HOF FUDZIAMA SAN VOM ROLLENDEN HAUS',
  // The catalogue holds two dogs of this name, distinguished by birth year; only the
  // 2002 bitch has offspring recorded.
  'OSTARA OF M. EARLY SUMMER JP (2002)',
  'RYUUCHI OF MARUKO NOMURA JP',
  'ACCEL OF GOD MOUNT JP',
  'SPITZ PARADISE ANGEL MITO',
  'PRIZE OF MATSUSHIMOSATO',
  'KIKUCHIYO OF SHONAN SUMIRESOW JP',
  'SHONAN SUMIRESOW JP SAYAKO',
  'JIN-CHERRY JP EMILY',
  "NEW TOKYO KENNEL'S JODDY",
  'BRANLY OF CASABLANCA TOMO JP',
  'NAOMI OF KONPARU WAKATA JP',
  'LAPISLAZULI OF SYLPH SATO',
  'SPITZ PARADISE ANGEL AKI',
  'IKAR OF HONDASOW',
  'ORANGE HILL JP DORIS',
  'MILLION STEEPS WHITE CHOUCHOU FCI',
  'EREN HOF HAMAHIME FCI',
  'EREN HOF FUJIYAMA FCI',
  'TAKE MARU OF YOKOHAMA TAKADA',
  'EREN HOF HANKU FCI',
];
