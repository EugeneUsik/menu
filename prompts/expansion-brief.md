# Expansion Brief — minor ingredients and cooking steps

You are given **one group file** listing several recipes from a validated weekly menu. Write the
minor ingredients and the cooking instructions for exactly those recipes, and nothing else.

This brief exists so it is not restated in four near-identical prompts every week. Everything below
is the same for every group; only the group file differs.

## Output

Write exactly one file, the path given in your group file. Nothing else — no other file, no
verification pass, no reading the week JSON.

```json
{
  "recipe-id": {
    "add": [ { "name": "чеснок", "quantity": 12, "unit": "g" } ],
    "instructions": [ "шаг 1…", "шаг 2…", "шаг 3…" ]
  }
}
```

One key per recipe in your group, using the id exactly as given.

## `add` — remaining minor ingredients only

Aromatics, herbs, spices, citrus, water. **Never repeat or change an ingredient already listed** in
the group file: those quantities passed validation and are solved against every nutrition budget.

- State `соль` and `перец чёрный молотый` explicitly in grams. Never the legacy `соль, перец`
  catch-all, which makes sodium untrackable.
- **At most 2.5 g of salt in a savoury recipe, and none at all in a sweet breakfast or snack.**
  Ingredient sodium is already near the ceiling from bread, crispbread and canned goods, and the
  child has roughly 0.75 g of added-salt headroom across three home meals.
- Prefer water to broth. Both catalog broths are tagged `high_sodium` at ~330 mg/100 g, so a litre
  adds ~2,600 mg of sodium for very little flavour the aromatics do not already supply.

Only these names resolve against the catalog. Anything else is a hard failure:

```
чеснок, лук репчатый, лук красный, лук зелёный, лук-порей, имбирь свежий, укроп свежий,
петрушка свежая, кориандр свежий, тимьян свежий, розмарин свежий, шнитт-лук, зелень свежая,
лимон, сок лимонный, лайм, соль, перец чёрный молотый, паприка молотая, паприка копчёная,
зира молотая, куркума, корица молотая, кориандр молотый, тимьян сушёный, розмарин сушёный,
орегано сушёный, травы прованские сушёные, травы итальянские сушёные, лист лавровый,
порошок чесночный, перец чили хлопьями, перец кайенский, гарам масала, ванилин, вода
```

## `instructions` — 3 to 6 short Russian imperative steps

Concrete actions with real times and temperatures. No placeholders, no «готовить как обычно».

**Cooking steps only.** Do NOT write who gets which portion — the app derives that from the `for:`
tags and renders it as a Serving block. So none of:

- «порцию ребёнка залить молоком», «жене подать грецкие орехи и напиток с фитостеролами»
- «отложить 2 порции на обед следующего дня»

Both are already in the data. Repeating them costs the slowest phase of generation and tells the
reader nothing.

## Safety — absolute

A child in this household has a fruit allergy.

1. **No cherries, apples, pears, apricots or peaches** in any form or wording — fresh, dried,
   juice, purée, vinegar. `уксус яблочный` is excluded; use `уксус винный белый` or `сок лимонный`.
   Never write those fruit words at all, not even to say they are absent: a deterministic scanner
   rejects the stem wherever it appears.
2. **No processed meat** — ham, bacon, sausage, salami, smoked deli meat.

## Equipment

Available: oven, microwave, stovetop, immersion blender.

Not available: food processor, mincer, air fryer, multicooker, grill, deep fryer. Minced meat
(`фарш`) is bought already minced — never instruct mincing. `вырезка` is a whole tenderloin —
roast or pan-sear it.
