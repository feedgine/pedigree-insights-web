/**
 * Litter COI from two stored weight vectors — the one formula the publish and the browser
 * share.
 *
 * The additive relationship matrix factors as A = T·D·Tᵀ: `T_Xk` is Wright's contribution
 * of ancestor `k` to `X` (with `T_XX = 1`) and `D_k` is `k`'s Mendelian-sampling variance.
 * Storing `w_Xk = T_Xk·√D_k` per dog turns any coancestry into a dot product:
 *
 *     f(S, D) = ½·a(S, D) = ½ Σ_k w_Sk·w_Dk
 *
 * and the planned litter's COI is exactly f(sire, dam). It is the decomposition
 * Meuwissen-Luo and Colleau both rest on — the same quantity the vendored engine computes,
 * not an approximation of it — and `tests/unit/matingCoi.test.ts` holds the two together.
 *
 * Pure on purpose: no Node and no DOM APIs. The publish imports it to compute every dog's
 * own F, and the browser bundle imports it to compute the litter's, so the two cannot drift.
 *
 * [DRAFT — requires Yuliya's review]
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

/** One entry of a weight vector: the ancestor's slug and `T_Xk·√D_k`. */
export type WeightEntry = readonly [slug: string, weight: number];

/** A weight vector, sorted by slug in code-unit order with no repeated slug. */
export type Weights = readonly WeightEntry[];

/**
 * Coefficient of coancestry f(a, b) = ½ Σ w_ak·w_bk, as a fraction.
 *
 * A merge join of two sorted lists: linear in their combined length, no map, no
 * allocation. Both vectors must be sorted by the same code-unit comparison the publish
 * uses (`<` on strings), which is why that comparison is stated here and nowhere else.
 */
export function coancestry(a: Weights, b: Weights): number {
  let sum = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ka = a[i][0];
    const kb = b[j][0];
    if (ka === kb) {
      sum += a[i][1] * b[j][1];
      i += 1;
      j += 1;
    } else if (ka < kb) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return 0.5 * sum;
}

/** Order two weight entries by slug — the order every stored vector is in. */
export function bySlug(x: WeightEntry, y: WeightEntry): number {
  return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0;
}
