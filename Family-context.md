# Family Nutrition Context File

**Version:** 3.0  
**Purpose:** Context for weekly menu generation by an LLM agent.  
**Scope:** Generate family breakfasts, lunches, dinners, and optional shared family snacks while accounting for the child’s fixed school snack.

---

## 1. Household Profile

| Person  | Age / Sex | Weight | Height | Activity | Main Nutrition Goal |
| ------- | --------: | -----: | -----: | -------- | ------------------- |
| Husband | 40M | 70 kg | 180 cm | Jogging 3×5 km/week; push-ups 3×15; pull-ups 3×10 | Muscle gain/recomposition; reduce visceral fat |
| Wife | 40F | 62 kg | 164 cm | Functional training 3–4×/week, 15–20 min | Lose 3–4 kg to ~58–59 kg; lower LDL; improve energy and hormone stability |
| Child | 12M | 49 kg | 151 cm | Table tennis 2×/week; swimming 2×30 min/week; PE at school | Support puberty growth/height potential while avoiding excessive fat gain |

Meal pattern:

- All three eat breakfast, lunch, and dinner at home.
- Adults train in the morning after breakfast.
- Child’s sport is after school, usually after 15:00.
- The child has a **fixed school snack**. It is not generated or modified by the LLM, but it must be included in the child’s daily nutrition totals.

Cuisine:

- No fixed cuisine preference.
- Use a varied, practical mix of European, Mediterranean, Nordic/Baltic, and globally familiar meals.
- All ingredients must be realistically available in Lithuanian supermarkets such as Maxima, IKI, Rimi, Lidl, Norfa, or local markets.

---

## 2. Non-Negotiable Safety Constraints

### 2.1 Child allergy / exclusion list

The child must not consume the following in any form:

- Cherries
- Apples
- Pears
- Apricots
- Peaches

This includes:

- Fresh fruit
- Cooked fruit
- Baked fruit
- Juice
- Puree
- Compote
- Dried fruit
- Jam
- Sauce
- Baby-food-style puree
- Smoothie base
- Pastry filling
- Yogurt layer
- Dessert topping
- Cereal/bar filling
- Any hidden ingredient

For simplicity and safety:

- Avoid these fruits in all generated shared family meals.
- Do not use mixed-fruit products unless the ingredient list is explicitly free of the excluded fruits.
- Avoid vague “multifruit,” “garden fruit,” “forest fruit,” “fruit puree,” or “fruit filling” products unless ingredients are clear.
- Consider cross-contact risk in shared knives, cutting boards, lunchboxes, blenders, jars, and spreads.

Allowed fruits, unless family later reports intolerance:

- Berries
- Banana
- Citrus
- Kiwi
- Grapes
- Melon
- Mango
- Pineapple
- Plum only if family confirms tolerance

### 2.2 Processed meat rule

The LLM-generated menu must contain **no processed meat**.

Avoid in generated breakfasts, lunches, dinners, and optional shared snacks:

- Ham
- Sausages
- Bacon
- Salami
- Smoked processed deli meats
- Processed chicken/turkey/beef slices
- Processed meat spreads
- Hot dogs
- Meat-based ready meals with processed meat

Important exception / scope clarification:

- The child’s school snack is a **fixed external item** and may contain ham.
- The LLM must **not** suggest changing, replacing, removing, or “improving” the child’s fixed school snack unless the user explicitly asks.
- The ham in the fixed school snack must be counted nutritionally for the child, but it does **not** count as a failure of the generated-menu processed-meat rule.
- The LLM must not add any additional processed meat elsewhere in the menu.

Allowed generated-menu protein sources:

- Poultry cooked from raw meat
- Fish and seafood
- Eggs and egg whites
- Greek yogurt / skyr / kefir / cottage cheese
- Legumes
- Tofu / soy foods
- Lean red meat no more than allowed weekly frequency
- Store-bought raw minced meat if needed

---

## 3. Equipment and Cooking Constraints

Available:

- Oven
- Microwave oven
- Stovetop
- Dishwasher
- Immersion blender

Do not assume:

- Food processor
- Mincer
- Air fryer
- Multicooker / Instant Pot
- Grill

Cooking-time rules:

- Weekday active cooking should usually be ≤30 minutes.
- Prefer cook-once-eat-twice structures.
- Leftovers may be used for next-day lunches, but this is not mandatory.
- Dinner can be sized for 6 portions when practical: 3 dinner portions + 3 next-day lunch portions.
- Leftovers must still meet each person’s protein and energy requirements.
- Weekend cooking may be longer if it creates useful leftovers for the week.

---

## 4. Energy and Macronutrient Targets

Targets are working planning ranges, not rigid single numbers. Daily and weekly averages matter more than perfect precision on every individual meal.

### 4.1 Husband — 40M, 70 kg, 180 cm

Estimated BMR: ~1,630 kcal/day.  
Estimated TDEE: ~2,500–2,600 kcal/day.

Planning target:

- Calories: ~2,350–2,450 kcal/day average
- Protein: 130–145 g/day
- Minimum protein per main meal: ≥35 g
- Carbohydrates: ~45–55% of energy, mainly complex carbohydrates
- Fat: ~25–35% of energy
- Saturated fat: <10% of energy
- Fiber: ≥35 g/day
- Salt: <5 g/day
- Vegetables + fruit: ≥400 g/day

Meal distribution guide:

- Breakfast: ~500–650 kcal, 35–45 g protein
- Lunch: ~650–800 kcal, 40–50 g protein
- Dinner: ~650–800 kcal, 40–50 g protein
- Snack/add-ons: ~200–400 kcal as needed

Goal interpretation:

- Use a slight deficit or near-maintenance approach, not aggressive dieting.
- Preserve and build lean mass with high protein.
- Include carbohydrate around breakfast/lunch to support morning exercise and recovery.

Preferred protein sources:

- Poultry
- Fish and seafood
- Eggs
- Greek yogurt / skyr / kefir / cottage cheese
- Legumes
- Tofu / soy foods
- Lean red meat no more than 2×/week

---

### 4.2 Wife — 40F, 62 kg, 164 cm

Estimated BMR: ~1,280 kcal/day.  
Estimated TDEE: ~1,800–1,950 kcal/day.

Planning target:

- Calories: ~1,550–1,650 kcal/day average
- Protein: 95–105 g/day
- Minimum protein per main meal: ≥28 g
- Fiber: ≥30 g/day
- LDL-focused viscous/soluble fiber: include a daily source such as oats, barley, legumes, ground flaxseed, chia seeds, berries, citrus, or vegetables
- When oats/barley are used, try to approach ~3 g/day beta-glucan from oats/barley for cholesterol-lowering support
- Fat: ~25–30% of energy
- Saturated fat: preferably ≤11 g/day and <7% of energy
- Trans fat: as close to zero as possible
- Free sugars: ideally <5% of energy
- Salt: <5 g/day
- Vegetables + fruit: ≥400 g/day

Meal distribution guide:

- Breakfast: ~350–450 kcal, 28–35 g protein
- Lunch: ~450–550 kcal, 30–35 g protein
- Dinner: ~500–600 kcal, 30–40 g protein
- Snack: ~100–200 kcal if needed for energy stability

Blood results from February 2026:

- Total cholesterol: 6.43 mmol/L, elevated
- LDL: 4.22 mmol/L, elevated
- HDL: 1.82 mmol/L, good
- Triglycerides: 0.86 mmol/L, good
- Vitamin D: 76.8 nmol/L, adequate by many reference systems but worth maintaining
- Magnesium: 0.73 mmol/L, low-normal
- Free T4: 12.3 pmol/L, low-normal
- HbA1c: 5.2%, normal

LDL-lowering priorities:

1. Include oats, barley, legumes, or other viscous/soluble-fiber-rich foods daily.
2. Include fatty fish at least 2×/week: salmon, mackerel, herring, sardines.
3. Include walnuts most days, ideally ~15–30 g/day for the wife depending on calorie room.
4. Include soy foods regularly: tofu, edamame, soy milk, soy yogurt, or tempeh.
5. Avoid saturated-fat stacking: do not combine cheese + fatty meat + cream/butter-rich sauce in the same meal.
6. Whole eggs: maximum 1 whole egg/day for wife. Use egg whites when extra egg volume is needed.
7. Prefer low-fat dairy over high-fat dairy.
8. Prefer olive oil, avocado, nuts, seeds, and fatty fish over butter, cream, coconut fat, and fatty cheese.
9. Use legumes/oats/barley/soy not only as “healthy extras,” but as structural parts of meals.

Micronutrient priorities:

- Vitamin D: fatty fish, eggs, UV-exposed mushrooms, fortified foods; diet alone may be insufficient.
- Magnesium: pumpkin seeds, legumes, almonds, leafy greens, whole grains, dark chocolate ≥70%.
- Iodine: seafood, dairy, iodized salt in controlled quantity.
- Calcium: low-fat dairy, fortified soy milk, kefir, yogurt, cottage cheese, sardines with bones, kale.
- Phytoestrogens: flaxseed, soy foods, legumes.

Hormone-stability support:

- Avoid very low-calorie days.
- Include protein at breakfast.
- Include magnesium-rich foods daily.
- Include omega-3 fats regularly.
- Include legumes, flaxseed, soy, and whole grains multiple times weekly.
- Do not create an aggressive deficit that worsens fatigue, hunger, sleep, training quality, or cycle stability.

Medical note:

- The LDL goal should be individualized by a clinician based on total cardiovascular risk, family history, blood pressure, smoking status, ApoB/non-HDL if available, Lp(a), thyroid status, and other risk modifiers.
- Food plan supports lipid improvement but does not replace medical follow-up.

---

### 4.3 Child — 12M, 49 kg, 151 cm

Estimated energy needs vary with growth velocity, school movement, appetite, sport intensity, and puberty stage.

Planning target:

- Calories: roughly ~2,100–2,550 kcal/day including the fixed school snack
- Do not intentionally restrict energy
- Avoid chronic calorie surplus by controlling energy-dense snacks, sugary foods, fried foods, and oversized refined-carbohydrate portions
- Protein: 70–85 g/day
- Minimum protein per main meal: ≥20 g
- Fiber: ≥25 g/day
- Calcium: ~1,300 mg/day
- Vitamin D: support with food sources, but do not claim diet alone guarantees ≥600 IU/day unless food amounts clearly support it
- Dairy or fortified calcium source: at every meal where feasible
- Fruit + vegetables: ≥350 g/day
- Salt: keep below adult ceiling; avoid high-salt stacking

Meal distribution guide:

- Breakfast: ~450–650 kcal, 20–30 g protein
- Fixed school snack: ~350–450 kcal, ~18–30 g protein
- Lunch: ~550–700 kcal, ≥20 g protein
- Dinner: ~600–800 kcal, ≥20 g protein
- Sport-day add-on if needed: ~100–250 kcal from fruit, dairy/kefir, whole-grain bread, potatoes, rice, or oats

Growth-critical nutrients:

- Calcium: dairy, kefir, yogurt, milk, cottage cheese, cheese in moderate amounts, fortified soy milk, sardines with bones.
- Vitamin D: fatty fish, eggs, fortified foods, mushrooms exposed to UV.
- Zinc: lean beef, poultry, fish, seafood, pumpkin seeds, legumes, whole grains.
- Iron: lean red meat 1–2×/week, poultry, fish, legumes, spinach with vitamin C.
- Iodine: dairy, seafood, iodized salt.

Weight-gain tendency rule:

- Do not solve weight tendency by calorie restriction.
- Use high-satiety meals: protein + fiber + vegetables + whole grains.
- Avoid liquid calories, sweet drinks, frequent desserts, oversized refined snacks, and low-protein breakfasts.
- Monitor total day balance including the fixed school snack.
- Growth curve, waist trend, appetite, sport performance, sleep, and pediatric guidance are more important than forcing a precise daily calorie number.

---

## 5. Fixed Child School Snack

The child’s school snack is **constant** and should be treated as external context.

The LLM must:

- Include this snack in the child’s daily calories, protein, fiber, calcium, sodium, and saturated-fat estimates.
- Use it to adjust the rest of the day’s menu.
- Not suggest replacing, removing, changing, upgrading, or “healthifying” the snack.
- Not treat the ham in this snack as a generated-menu violation.
- Avoid adding additional processed meat elsewhere.

Current fixed snack pattern:

- Tortilla wrap
- Ham
- Philadelphia-style cream cheese
- Salad
- Bell pepper

Assumptions for nutrition accounting:

- Tortilla is preferably whole-grain if that is already the family’s usual choice, but do not instruct the family to change it.
- Cream cheese is plain, not fruit-flavored.
- Snack contains no apple, pear, cherry, peach, or apricot ingredients.
- Exact product nutrition may vary; use approximate accounting unless the user provides package labels.

Approximate snack accounting target:

- Calories: ~350–450 kcal
- Protein: ~18–30 g
- Fiber: ≥4 g if whole-grain tortilla and vegetables are used
- Calcium: ideally ≥150–300 mg
- Sodium: likely moderate to high because of ham + cream cheese + tortilla; account for this by keeping the rest of the child’s day lower in salt

Menu-generation implication:

- Because the fixed snack already contains processed meat and may be salty, the generated family menu should avoid additional processed meat and avoid unnecessary high-sodium stacking on school days.
- Do not compensate by underfeeding the child at lunch or dinner.

---

## 6. Shared Weekly Meal Rules

### 6.1 Meal frequency

Plan:

- 7 breakfasts
- 7 lunches
- 7 dinners
- Shared family snack on at least 4 of 7 days
- Fixed child school snack accounted for on school days or all relevant days specified by the user

Breakfasts do not need to be unique every day. Use 2–4 rotating breakfast patterns with enough variation.

### 6.2 Breakfast rule

No grain-only breakfasts.

Every breakfast must include:

- Protein anchor
- Fiber-rich carbohydrate or fruit/vegetable
- Healthy fat or seeds where appropriate
- Dairy or fortified calcium source for child

Good breakfast anchors:

- Greek yogurt / skyr
- Cottage cheese
- Kefir + oats + seeds
- Eggs + egg whites
- Tofu scramble
- Smoked or baked fish occasionally
- Nut butter / seeds as support, not sole protein

Avoid:

- Plain porridge without protein
- Cereal with milk only
- Toast with jam
- Pastries
- Sweet yogurt bowls with low protein

Breakfast validation:

- Husband: ≥35 g protein
- Wife: ≥28 g protein
- Child: ≥20 g protein
- Child receives calcium source
- No excluded fruits

### 6.3 Lunch rule

Lunch may be:

- Leftovers from dinner
- Quick separate meal
- Soup + protein side
- Grain bowl
- Omelet / egg-white meal
- Cottage cheese or Greek yogurt plate
- Salad with sufficient protein and carbohydrate
- Wrap or sandwich only if it uses non-processed protein in the generated menu

Every lunch must meet protein floors:

- Husband: ≥35 g protein
- Wife: ≥28 g protein
- Child: ≥20 g protein

If lunch is leftovers, protein must be checked by person, not assumed.

### 6.4 Dinner rule

Dinners should be family-shared where possible, with portion adjustments.

Dinner should usually include:

- One clear protein source
- One whole-grain or starchy carbohydrate source
- At least 2 vegetables or one large vegetable component
- Healthy fat source, preferably olive oil, nuts, seeds, avocado, or fatty fish

### 6.5 Plate model

For adults:

- ½ plate vegetables and/or fruit
- ¼ plate whole grains or starchy carbohydrate
- ¼ plate protein

For child:

- Similar structure, but do not underfeed energy.
- Add dairy/calcium source where feasible.
- Portions usually ~80–90% of adult portions, but may need more carbohydrate or dairy on sport days.

---

## 7. Weekly Frequency Targets

| Food / Nutrient Target | Weekly Requirement |
| ---------------------- | ------------------ |
| Fatty fish | ≥2 meals/week; use salmon, mackerel, herring, sardines. Tuna and cod do not count as fatty fish. |
| Legumes | ≥3 meals/week: lentils, chickpeas, beans, peas. |
| Soy foods | Ideally 4–7 inclusions/week, especially for wife’s LDL target. Soy sauce does not count. |
| Red meat | Adults ≤2 generated meals/week; child 1–2 generated meals/week acceptable. Prefer lean beef. |
| Processed meat | 0 in generated meals/snacks. Fixed child school snack is external and not counted as generated-menu failure. |
| Walnuts | Wife ideally 15–30 g most days depending on calorie room. |
| Oats / barley / viscous-fiber source | Daily, especially for wife. |
| Magnesium-rich foods | Daily. |
| Calcium-rich foods for child | Every meal where feasible; structurally aim toward ~1,300 mg/day. |
| Vegetables + fruit | Adults ≥400 g/day; child ≥350 g/day. |
| Shared family snack | ≥4 days/week. |
| High-sugar desserts | Occasional only; not daily. |
| Sweet drinks / juice | Avoid as routine beverages. |
| Sodium | Avoid stacking salty fish + cheese + bread/wrap + canned foods in the same day. |

---

## 8. Ingredient Preferences and Restrictions

No family dislikes reported.

Allowed and acceptable:

- Dairy
- Soy foods
- Legumes
- Fish and seafood
- Nuts
- Seeds
- Eggs
- Poultry
- Lean red meat
- Whole grains
- Vegetables
- Fruits except child’s excluded fruits

Preferred staples:

- Oats
- Buckwheat
- Barley
- Brown rice
- Whole-grain bread
- Rye bread
- Whole-grain pasta
- Potatoes
- Lentils
- Chickpeas
- Beans
- Tofu
- Greek yogurt
- Skyr
- Kefir
- Cottage cheese
- Low-fat milk
- Fortified soy milk
- Salmon
- Mackerel
- Herring
- Sardines
- Cod or other white fish, but not as replacement for omega-3 fish
- Chicken breast / turkey
- Lean beef
- Eggs and egg whites
- Olive oil
- Walnuts
- Almonds
- Pumpkin seeds
- Ground flaxseed
- Chia seeds
- Leafy greens
- Carrots
- Bell peppers
- Tomatoes
- Cucumbers
- Broccoli
- Cabbage
- Beetroot
- Mushrooms
- Berries
- Bananas
- Citrus
- Kiwi
- Grapes
- Melon

Avoid or strongly limit in generated meals:

- Butter-heavy meals
- Cream sauces
- Fatty cheese-heavy meals
- Coconut milk/fat as a regular ingredient
- Fried foods
- Sausages and processed meats
- Sugary breakfast cereals
- Pastries as breakfast
- Juice
- Sweetened yogurts
- High-sugar snacks
- Large portions of refined bread/pasta without protein/fiber balance

---

## 9. Portioning Logic

Use the same base meal when possible, but adjust portions by person.

### 9.1 Husband

Usually needs:

- Largest protein portion
- Moderate-large carbohydrate portion, especially around training days
- High-fiber carbohydrate
- Extra protein add-on if shared meal is low protein

Examples of add-ons:

- Extra Greek yogurt
- Extra skyr
- Extra chicken/fish/tofu
- Cottage cheese
- Egg whites
- Protein-rich side salad with beans
- Kefir smoothie with oats

### 9.2 Wife

Usually needs:

- High protein
- High fiber
- Controlled calories
- Controlled saturated fat
- More vegetables
- Moderate carbohydrate portions
- Daily LDL-focused components

Adjustments:

- Use low-fat dairy.
- Use smaller oil portions.
- Use walnuts intentionally, usually 15–30 g depending on the day’s calories.
- Avoid cheese-heavy extras.
- Prefer legumes/oats/barley/soy as carbohydrate-protein-fiber anchors.
- Avoid hidden saturated-fat stacking across the whole day, not just within one meal.

### 9.3 Child

Usually needs:

- Adequate total energy
- Adequate protein
- High calcium
- Sport-supportive carbohydrates
- No aggressive calorie reduction

Adjustments:

- Add milk/kefir/yogurt where suitable.
- Add extra whole-grain bread, potatoes, rice, pasta, oats, or fruit on sport days.
- Keep sweets and liquid calories limited.
- Include the fixed school snack in daily energy count.
- Do not compensate for the snack by making lunch/dinner too small.

---

## 10. Daily Validation Requirements

Each day must be checked per person, not only per recipe.

### 10.1 Husband daily checks

- Calories: ~2,350–2,450 kcal average
- Protein: 130–145 g
- Each main meal protein: ≥35 g
- Fiber: ≥35 g
- Saturated fat: <10% energy
- Salt: <5 g
- Vegetables + fruit: ≥400 g

### 10.2 Wife daily checks

- Calories: ~1,550–1,650 kcal average
- Protein: 95–105 g
- Each main meal protein: ≥28 g
- Fiber: ≥30 g
- LDL-supportive viscous/soluble-fiber source present
- Saturated fat: ≤11 g preferred
- Free sugars: ideally <5% energy
- Salt: <5 g
- Vegetables + fruit: ≥400 g
- LDL-supportive foods present: oats/barley/legumes/soy/walnuts/fatty fish depending on the day

### 10.3 Child daily checks

Include the fixed school snack in totals.

- Calories: roughly ~2,100–2,550 kcal depending on appetite, sport, and growth
- Protein: 70–85 g
- Each main meal protein: ≥20 g
- Fiber: ≥25 g
- Calcium: structurally supported toward ~1,300 mg/day
- Vitamin D: food sources included where practical, but do not claim guaranteed adequacy unless food amounts clearly support it
- Vegetables + fruit: ≥350 g
- No exposure to excluded fruits
- No processed meat in generated meals, while accounting for the fixed school snack separately
- Sodium risk reviewed because the fixed snack may be salty

---

## 11. Weekly Validation Requirements

The full week must be checked after the meal plan is built.

The week is unacceptable if any of these fail:

1. Any child allergy item appears anywhere in generated meals or in any suggested family snack.
2. The LLM suggests changing or replacing the child’s fixed school snack without being explicitly asked.
3. Processed meat appears in any generated meal or generated shared snack.
4. The ham in the fixed child school snack is incorrectly treated as a generated-menu failure.
5. Fatty fish appears fewer than 2 times.
6. Legumes appear fewer than 3 times.
7. Soy foods are absent or token-only.
8. Wife’s saturated fat target is repeatedly exceeded.
9. Wife’s fiber and LDL-supportive viscous/soluble fiber targets are not intentionally supported.
10. Child’s calcium target is not structurally supported daily.
11. Protein floors are met only at dinner but not at breakfast/lunch.
12. Leftovers are assigned as lunches without checking protein adequacy.
13. The plan looks balanced per meal but fails daily or weekly totals.
14. The child’s fixed school snack is excluded from daily nutrition accounting.
15. Adult fat-loss targets are achieved by making the child’s diet too low-energy.
16. The wife’s calorie deficit is too aggressive for training, energy, sleep, hunger, or hormonal stability.
17. The menu is nutritionally good but unrealistic for weekday cooking.
18. Sodium is not reviewed, especially on days with herring/sardines/cottage cheese/cheese/canned foods plus the child’s fixed snack.

The final weekly review should include a pass/fail checklist for:

- Per-person calories
- Per-person protein
- Meal-level protein floors
- Fiber
- LDL-supportive viscous/soluble fiber for wife
- Saturated fat for wife
- Calcium for child
- Fatty fish frequency
- Legume frequency
- Soy inclusion
- Red meat limit
- Processed meat exclusion in generated menu
- Allergy exclusion
- Child fixed snack accounted for
- Fixed snack not modified
- Sodium risk
- Cooking-time feasibility
- Leftover feasibility

---

## 12. Practical Menu Construction Rules

Use meals that are realistic for a family cooking at home.

Prioritize:

- Batch-friendly dinners
- Leftover-compatible lunches
- Simple breakfasts
- Minimal active cooking on weekdays
- One main weekend shopping trip
- Optional mid-week restock for fish, poultry, meat, berries, greens, dairy

Weekday meals should use simple methods:

- Oven tray bake
- Stovetop one-pot meal
- Soup + protein side
- Grain bowl
- Salad bowl
- Omelet / egg-white scramble
- Yogurt/cottage cheese bowl
- Fish + potatoes + vegetables
- Tofu/legume stir-fry without requiring rare sauces

Avoid recipes requiring:

- Food processor
- Mincer
- Long weekday prep
- Rare specialty ingredients
- Multiple separate sauces
- Deep frying
- Complex pastry work

---

## 13. Preferred Meal Patterns

### 13.1 Breakfast examples

Suitable breakfast patterns:

- Oats + Greek yogurt/skyr + berries + ground flaxseed + walnuts
- Cottage cheese + whole-grain bread + vegetables + berries/citrus
- Eggs + egg whites + rye bread + vegetables + kefir for child
- Tofu scramble + whole-grain toast + vegetables + dairy/fortified soy drink
- Buckwheat porridge + Greek yogurt + seeds + berries
- Kefir smoothie bowl with oats, berries, chia/flax, and added protein from skyr or cottage cheese

Avoid grain-only breakfasts.

### 13.2 Lunch examples

- Leftover salmon + potatoes/barley + vegetables
- Lentil soup + cottage cheese/Greek yogurt side
- Chicken buckwheat bowl + vegetables
- Chickpea salad + tuna/egg/tofu
- Turkey or chicken wrap with vegetables and yogurt sauce, using only non-processed cooked poultry
- Bean chili leftovers with rice and salad
- Cottage cheese plate with rye bread, vegetables, and fruit
- Tofu rice bowl with vegetables
- Sardine potato salad with kefir/yogurt dressing

### 13.3 Dinner examples

- Salmon/mackerel/herring/sardines + potatoes/barley + vegetables
- Chicken tray bake with buckwheat and salad
- Lentil/bean stew with yogurt side
- Tofu stir-fry with rice and vegetables
- Lean beef chili with beans
- Turkey meatballs from store-bought raw minced turkey + whole-grain pasta + tomato vegetable sauce
- Sardine or tuna potato salad with kefir/yogurt dressing
- Vegetable soup with added beans and chicken/tofu
- Barley risotto-style dish with mushrooms + chicken/tofu
- Chickpea and vegetable curry using tomato/yogurt base rather than coconut-heavy sauce

### 13.4 Shared family snack examples

Family snacks should provide approximately 10 g protein per adult serving and calcium for child.

Good options:

- Greek yogurt/skyr + berries + seeds
- Kefir + rye crispbread + cottage cheese
- Cottage cheese + cucumber/tomato + whole-grain bread
- Fortified soy yogurt + walnuts/berries
- Hummus + vegetables + boiled egg
- Smoothie with kefir/skyr, berries, oats, and flaxseed
- Dark chocolate ≥70% in small portion + Greek yogurt + berries
- Nuts/seeds with dairy or soy protein source
- Banana + kefir after child sport if extra energy is needed

Avoid:

- Juice
- Sweet drinks
- Candy as routine snack
- Fruit bars unless checked for excluded fruits
- Sweetened yogurts with high sugar
- Pastries as routine snack

---

## 14. Sodium Management

Salt target:

- Adults: <5 g salt/day, equivalent to <2 g sodium/day.
- Child: keep below adult ceiling and avoid high-salt stacking.

High-sodium foods that may appear in the family diet:

- Herring
- Sardines
- Canned fish
- Canned beans/chickpeas/lentils
- Cottage cheese
- Cheese
- Rye bread
- Whole-grain bread
- Tortillas
- Cream cheese
- Ham in the fixed child snack

Operational rules:

- Rinse canned legumes when possible.
- Prefer lower-salt canned fish/legumes/dairy when available.
- Do not combine salty fish + cheese + bread/wrap + canned foods in the same day unless portions are small and sodium is reviewed.
- Since the child’s fixed school snack may be salty, avoid additional salty generated meals for the child on the same day.
- Use iodized salt in controlled quantity rather than large amounts of non-iodized gourmet salt.

---

## 15. LLM Output Requirements

When generating a weekly menu, the LLM must output:

1. Weekly menu table.
2. Fixed child school snack included in the child’s daily nutrition accounting, without modification suggestions.
3. Portion adjustments for husband, wife, and child.
4. Cook-once-eat-twice notes.
5. Shopping list grouped by category.
6. Daily nutrition estimate per person.
7. Weekly validation checklist.
8. Allergy and processed-meat safety check.
9. Sodium-risk notes.
10. Assumptions made.

Nutrition estimates may be approximate, but the LLM must not claim false precision.

Use cooked weights where possible for grains, potatoes, pasta, meat, and fish. Use raw weights only when clearly stated.

---

## 16. Supplement and Medical Follow-Up Notes

Food plan should support, but not replace, clinical follow-up.

For wife:

- Vitamin D may require supplementation to maintain or improve status, especially outside summer.
- LDL should be rechecked after sustained dietary changes.
- LDL goal should be individualized by clinician based on total cardiovascular risk.
- Thyroid-related labs should be interpreted by a clinician if fatigue, cold intolerance, cycle changes, or other symptoms are present.

For child:

- Growth, weight trend, and puberty progression should be monitored over time.
- Do not use adult-style calorie restriction during puberty.
- Vitamin D and calcium adequacy are especially important during puberty.

---

## 17. Priority Order When Rules Conflict

Use this priority order:

1. Child allergy exclusions.
2. Do not modify or replace the fixed child school snack unless explicitly asked.
3. No processed meat in the generated menu.
4. Child energy adequacy and growth support.
5. Wife LDL and saturated fat control.
6. Per-person protein minimums.
7. Child calcium target.
8. Daily fiber targets.
9. Weekly fatty fish and legume frequency.
10. Sodium control.
11. Cooking time and practicality.
12. Variety and cuisine diversity.

---

## 18. Reference Anchors

The sodium ceiling aligns with WHO guidance to keep adult sodium below 2 g/day, equivalent to about 5 g salt/day, with children’s limits adjusted downward by energy needs.  
Source: https://www.fao.org/ag/humannutrition/36218-01fcfa3030e8fd3f21952e7c51fc89e79.pdf

The free-sugar target follows WHO guidance recommending free sugars below 10% of energy, with further benefit suggested below 5%.  
Source: https://www.who.int/publications/i/item/9789241549028

The child calcium target aligns with NIH Office of Dietary Supplements reference intakes for ages 9–18: 1,300 mg calcium/day.  
Source: https://ods.od.nih.gov/factsheets/Calcium-HealthProfessional/

The vitamin D target of 600 IU/day is consistent with common reference intakes for children and adults, but diet alone may not reliably achieve this every day without fatty fish, fortified foods, or supplementation.  
Source: https://ods.od.nih.gov/factsheets/VitaminD-Consumer/

The practical LDL-lowering beta-glucan target from oats/barley is approximately 3 g/day.  
Source: https://efsa.onlinelibrary.wiley.com/doi/abs/10.2903/j.efsa.2011.2471

Food allergy management should include label reading and cross-contact prevention.  
Source: https://www.foodallergy.org/resources/avoiding-cross-contact
