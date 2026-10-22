/**
 * The planned litter's bracket, built from the two parents' grids.
 *
 * The litter is drawn by the dog page's own template, `render/bracket.ts`, not a copy of
 * it: the same cells, the same fixed four generations, and the same repeated-ancestor
 * shading — which on a litter is exactly the ancestors the parents share, so the shading
 * marks them with no new code. All that is new is turning heap-ordered grid slots into
 * the bracket's path ids.
 *
 * The litter itself is node `0`, generation 0. The template never draws generation 0 (a
 * dog is not in its own pedigree), so the litter is never a cell and never a link.
 *
 * [DRAFT — requires Yuliya's review]
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import type { BracketNode } from '../publish/bracketNode';
import { PLANNED_LITTER_NAME } from '../vendor/pedigree-insights/hypotheticalMating';
import { BRACKET_LAST_SLOT, type MatingObject } from './object';

/**
 * The path below a parent for a grid slot: slot 1 → `.S`, 2 → `.D`, 3 → `.S.S`, … — the
 * bits of `slot + 1` after its leading one, sire for 0 and dam for 1.
 */
export function slotPath(slot: number): string {
  const bits = (slot + 1).toString(2).slice(1);
  let path = '';
  for (const b of bits) path += b === '0' ? '.S' : '.D';
  return path;
}

/** One parent and its first three generations, under path `0.S` or `0.D`. */
function parentNodes(o: MatingObject, side: 'S' | 'D'): BracketNode[] {
  const root = `0.${side}`;
  const nodes: BracketNode[] = [
    {
      id: root,
      generation: 1,
      name: o.name,
      slug: o.slug,
      ...(o.self.preTitle ? { preTitle: o.self.preTitle } : {}),
      ...(o.self.postTitle ? { postTitle: o.self.postTitle } : {}),
      ...(o.self.registration ? { registration: o.self.registration } : {}),
      ...(o.self.dob ? { dob: o.self.dob } : {}),
    },
  ];
  for (let slot = 1; slot <= BRACKET_LAST_SLOT; slot += 1) {
    const i = o.grid[slot];
    if (i == null) continue;
    const e = o.dict[i];
    const path = slotPath(slot);
    nodes.push({
      id: root + path,
      generation: 1 + path.length / 2,
      name: e.name,
      slug: e.slug,
      ...(e.preTitle ? { preTitle: e.preTitle } : {}),
      ...(e.postTitle ? { postTitle: e.postTitle } : {}),
      ...(e.registration ? { registration: e.registration } : {}),
      ...(e.dob ? { dob: e.dob } : {}),
    });
  }
  return nodes;
}

/** The litter's bracket nodes: the litter, both parents, three generations behind each. */
export function litterBracket(sire: MatingObject, dam: MatingObject): BracketNode[] {
  return [
    { id: '0', generation: 0, name: PLANNED_LITTER_NAME, slug: null },
    ...parentNodes(sire, 'S'),
    ...parentNodes(dam, 'D'),
  ];
}
