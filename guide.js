/* =====================================================================
   Macroscope — the beginners' guide of the desk.
   A « How it works? » button opens a side panel listing the cards of
   the mechanisms at work (titles only; one opens at a time) and, in a
   tab of its own, a glossary. Small ⓘ buttons next to the levers, votes
   and cards open the matching card. The cards describe mechanisms and
   the direction of effects, never their size nor what to do.
   Shown only the cards that fit the class (model version, duel, options).
   Switched off for a class by the administrator (state.sim.guide ===
   false). Text in English and French, chosen by i18n.js (MXL.lang); the
   panel is left alone by the page translator (translate="no").
   The glossary keeps only the words of the cards the class sees.
   Anchors: any element with data-guide="<card id>[ <card id>…]" gets
   its ⓘ (before its .hint child if any). ES5.
   ===================================================================== */
var MXGUIDE = (function () {
  'use strict';

  /* which cards a class sees */
  /* the model and its options (MS from core.js): prices in trade in every model but the former v1.1; capital flows in Finance */
  function isDuel(st) { return !!(st && st.kind === 'duel'); }
  function prices(st) { return MS.modelId(st) !== 'v1.1'; }
  function finance(st) { return MS.financeModel(st); }
  var SHOW = {
    score: function () { return true; },
    demand: function () { return true; },
    leaks: function (st) { return !isDuel(st); },
    vat: function () { return true; },
    rate: function (st) { return !isDuel(st); },
    reserves: function (st) { return !isDuel(st); },
    deval: function (st) { return !isDuel(st); },
    coop: function (st) { return !isDuel(st); },
    decomp: function () { return true; },
    compet: function (st) { return !isDuel(st) && prices(st); },
    float: function (st) { return !isDuel(st) && finance(st); },
    debt: function (st) { return !isDuel(st) && finance(st); },
    climate: function (st) { return MS.climateOn(st); },
    households: function (st) { return MS.householdsOn(st); },
    exit: function (st) { return !isDuel(st) && !!(st && st.sim && (st.sim.exit || st.sim.tariffs)); },
    duel: function (st) { return isDuel(st); }
  };
  var ORDER = ['score', 'demand', 'leaks', 'vat', 'rate', 'reserves', 'deval', 'coop', 'decomp', 'compet', 'float', 'debt', 'climate', 'households', 'exit', 'duel'];

  /* [[id]] in a text = a link to that card (plain words when the class does not see it) */
  var T = {
    en: {
      button: 'How it works?', title: 'How it works', close: 'Close',
      tabCards: 'The mechanisms', tabGlossary: 'Glossary',
      intro: 'Short cards on the mechanisms at work in your economy: what moves what, and in which direction. They do not say what to do — that is your call, and your justification.',
      glossIntro: 'The words of the game, in plain terms.',
      info: 'Explain: ',
      parts: ['In one sentence', 'The chain', 'On your score', 'What can change everything', 'The question to ask yourselves'],
      cards: {
        score: ['The score R: five objectives pulling in different directions',
          'Each year your government is scored on five results, measured as gaps from the path the economy would have followed with no shock and no policy: GDP, unemployment, inflation, the public balance, the trade balance.',
          'The year’s gaps → times their weights → the score of the year R → added up year after year → the cumulative R, which makes the ranking.',
          'GDP, the public balance and the trade balance count in your favour; unemployment and inflation against you.',
          'Almost every policy improves some dimensions and worsens others: supporting GDP often costs deficit and inflation, cleaning up the accounts often costs growth. An election can change the weights during the game. R is judged over the whole game: a weak year can prepare better ones, and the reverse.',
          'Which dimensions are you ready to sacrifice this year, and to gain what later?'],
        demand: ['Stimulating demand: the multiplier',
          'A euro of public spending becomes someone’s income, who spends part of it, which becomes someone else’s income…: the total effect on GDP exceeds the initial spending.',
          'Spending ↑ → output ↑ → incomes ↑ → consumption ↑ → output ↑… Each round is smaller than the last, because of leakages ([[leaks]]).',
          'GDP ↑ · unemployment ↓ · inflation ↑ · public balance ↓ (the extra spending, partly offset by the revenue growth brings) · trade balance ↓.',
          'The three instruments do not act alike. Public demand enters output directly. Benefits and an income-tax cut go through households’ income first, and households save part of it. A one-off stimulus fades: households rebuild their wealth, then consumption settles. Cutting spending works the other way, with the same arrows reversed.',
          'Which instrument reaches output most directly, and which weighs most on the budget for the same effect?'],
        leaks: ['Leakages: your stimulus is your neighbours’ exports',
          'Part of each euro of income does not come back into domestic output: it is saved, taxed, or spent on imports.',
          'Incomes ↑ → imports ↑ → part of the demand goes to the union partners (their exports ↑) and part to the rest of the world (the union’s current account ↓, the common reserves ↓).',
          'Your trade balance ↓ · your GDP ↑ less than if everything stayed at home · your partners’ GDP ↑.',
          'If all members stimulate together, each gets back part of the others’ leakages. If one stimulates alone, it pays the deficit and shares the gain. Conversely, a country can benefit from the others’ stimulus without spending anything ([[coop]]). The share that goes to the rest of the world drains the reserves of the whole union ([[reserves]]).',
          'How much of your effort will stay at home, and what will your neighbours do?'],
        vat: ['The consumption tax (VAT)',
          'VAT is added to the price of what households buy: it brings revenue, but it passes into prices and cuts the volumes consumed.',
          'VAT ↑ → prices ↑ the year of the change → purchasing power ↓ → consumption in volume ↓ → output ↓ and imports ↓.',
          'Public balance ↑ · GDP ↓ · unemployment ↑ · inflation ↑ the year of the change, then it falls back (the price level stays higher) · trade balance ↑.',
          'The effect on inflation is one-off; the effect on the budget lasts. A VAT cut does the reverse: some purchasing power and less inflation the year it happens.',
          'At what point of the game does a burst of inflation cost you least?'],
        rate: ['The central bank’s rate',
          'The common rate sets the cost of credit for firms and the cost of debt for every government; the members vote to move it.',
          'Rate ↑ → the following year: investment ↓ → output ↓; interest paid on public debt ↑ → deficit ↑. Households earn slightly more interest, a mildly expansionary effect, weaker.',
          'This year: almost nothing. Next year: GDP ↓ · unemployment ↑ · inflation ↓ · public balance ↓ · trade balance ↑. A rate cut does the reverse.',
          'The one-year lag: what you vote now weighs on next year. The rate is common: a heavily indebted country and a lightly indebted one do not feel it the same way. A voted change stays until the next vote.',
          'What will you need next year, and what will your partners need?'],
        reserves: ['Foreign reserves and the external constraint',
          'With a fixed exchange rate, the common central bank covers the union’s current-account deficit with the rest of the world by selling its foreign reserves; that stock is shared by all members.',
          'Imports from the rest of the world ↑ or exports ↓ → the union’s current account ↓ → reserves ↓ → below 25 % of the initial stock: alert → the next year opens with a vote, austerity or devaluation (in the Finance model, also floating) → reserves exhausted with a continuing deficit: forced devaluation.',
          'Austerity: GDP ↓ · unemployment ↑ · inflation ↓ · public balance ↑ · trade balance ↑. Devaluation: see [[deval]].',
          'Each member’s deficit drains everyone’s stock: a member stimulating alone makes the others pay. A large shock can empty the reserves without going through the alert.',
          'How many years will the reserves last at the current pace, and who is widening the deficit?'],
        deval: ['Devaluation under a fixed rate',
          'Devaluing makes the union’s currency cheaper: imports cost more at once, exports become more competitive, but with a lag.',
          'Devaluation → this year: import prices ↑ → inflation ↑, import bill ↑ → current account ↓ (the J-curve) → the following year: exports ↑, imports ↓ → current account ↑, GDP ↑.',
          'This year: inflation ↑ · trade balance ↓ · GDP ↓. The following years: trade balance ↑ · GDP ↑ · unemployment ↓.',
          'The inflation the devaluation causes eats part of the competitiveness gain. The devaluation hits every member at the same time.',
          'Can your score absorb the bad year before the good ones?'],
        coop: ['Playing with the others: coordination and free riding',
          'What your partners do weighs on your results, and what you do weighs on theirs.',
          'A partner stimulates → it imports more → your exports ↑ → your GDP ↑ at no cost to your budget. Everyone waits for the others to stimulate → nobody does.',
          'Letting the others act can improve your R in the short run; if everyone does the same, everyone loses.',
          'At the council, pledges are public and decisions stay secret until the round closes: one can promise and not deliver, and the administrator may reveal it. The rate vote is won by majority, the reserves-crisis vote by the median choice: an alliance counts.',
          'What do you expect from your partners, and what are you ready to promise in return?'],
        decomp: ['Reading your results: the « of which » split',
          'Each result is split between what your own policy did, what the other countries’ policies did and what the shocks did.',
          'The model replays the year several times: with the shocks alone, then with your policy added, then with everything. The gaps between these runs give the « of which » lines.',
          'The line « of which your own policy » is the one you control; the others explain what happened to you.',
          'A poor total can hide a good policy (the shock was stronger), and the reverse. A year’s effects carry over to the following years.',
          'Does the gap between what you expected and what happened come from your policy, from the others or from the shocks?'],
        compet: ['Price competitiveness',
          'A country whose prices rise faster than its partners’ becomes dearer: it sells less and buys more abroad, a year later, and the gap accumulates.',
          'Inflation at home higher than elsewhere → relative price level ↑ → the following year: exports ↓, imports ↑ → output ↓.',
          'Over time: trade balance ↓ · GDP ↓ · unemployment ↑. Conversely, less inflation than the others slowly improves the trade balance.',
          'Inside a union there is no internal exchange rate: a country that loses competitiveness can only regain it through lower inflation than its partners. That is internal devaluation, and it goes through weaker demand. The effect of a stimulus therefore erodes year after year.',
          'Does this year’s policy make you dearer or cheaper than your neighbours for the years to come?'],
        float: ['Rates, capital and floating exchange rates',
          'Capital goes where it is best paid; under a floating rate its inflows and outflows move the currency up or down, instead of the reserves absorbing them.',
          'Union rate ↑ (or world rate ↓) → capital flows in → currency ↑ (appreciation) → cheaper imports, less competitive exports. Capital flight (sudden stop) → currency ↓ (depreciation) → dearer imports at once, more competitive exports with a lag.',
          'A depreciation: inflation ↑ at once · trade balance ↓ then ↑ · GDP: depends on the year. An appreciation does the reverse: inflation ↓, then competitiveness ↓.',
          'Under a fixed rate the same flows go through the reserves instead of the currency ([[reserves]]). If the currency falls a lot in a year, the union votes: defend it (the rate rises this year, bringing capital back but slowing investment and weighing on debt the following year) or let it float (nothing is done, imported inflation stays). A lasting sudden stop must be repeated every year by the administrator.',
          'What costs you more this year: imported inflation, or a higher rate next year?'],
        debt: ['Debt, risk premium and the backstop',
          'Beyond a certain level of debt, private lenders ask a higher rate to hold a government’s bills: that is the risk premium.',
          'Repeated deficits → debt ↑ → beyond the threshold: risk premium ↑ → interest ↑ → deficit ↑ → debt ↑. Foreign holders move to less indebted members.',
          'Public balance ↓ · GDP ↓ if the budget has to tighten.',
          'With the backstop, the central bank buys the bills nobody else wants, at the common rate: the premium stays small. Without it (an administrator decision), the rate rises until households and banks absorb the debt, and capital flight drains the union’s reserves.',
          'How far are you from the threshold, and what happens if the backstop goes?'],
        climate: ['The climate: damage, carbon tax, green investment',
          'Output emits; emissions build up in a global stock that damages everyone’s economy, whether they emitted a lot or a little.',
          'Output → emissions → pollution stock ↑ → damage ↑ → potential output ↓ → structural unemployment ↑ and inflation ↑ for every member. Carbon tax or green investment → carbon intensity ↓ the following year → emissions ↓.',
          'Carbon tax: public balance ↑ · inflation ↑ the year it changes · GDP ↓ · emissions ↓ afterwards. Green investment: GDP ↑ · public balance ↓ · trade balance ↓ (the equipment is largely imported) · emissions ↓ afterwards, less and less as you add more.',
          'Emissions count in R only if an election gives them a weight. The damage, though, shows in everyone’s unemployment and inflation. A country cutting its emissions alone pays the whole cost and gets only a small share of the benefit: it is a public good. The rest of the world emits too.',
          'Who pays for the effort, who benefits, and when?'],
        households: ['Modest and wealthy households: who gets what',
          'The population is split in two halves: the modest half lives on about a third of wages and on social benefits and spends almost all of it; the wealthy half gets the rest of wages and all capital income, pays the income tax and saves more.',
          'Benefits ↑ → income of the modest half ↑ → spent almost entirely → demand ↑, more than for a tax cut of the same amount. Income tax ↓ → income of the wealthy half ↑ → a larger part saved → demand ↑, but less. Growth raises wages and profits; benefits stay where they are.',
          'Benefits ↑: inequality ↓ · GDP ↑ · public balance ↓. Income tax ↑: inequality ↓ · GDP ↓ · public balance ↑. Income tax ↓: inequality ↑. Public demand ↑: GDP ↑ · inequality ↑ (wages and profits grow, benefits do not). Union rate ↑: inequality ↑ (the interest goes to the wealthy half).',
          'Inequality counts in R only if the administrator or an election gives it a weight. Taxing the wealthy half to pay benefits to the modest half can support demand without a deficit, because the modest half spends more of each euro.',
          'Who pays for your policy, who benefits from it, and does that change what they spend?'],
        exit: ['Leaving the union and tariffs',
          'A country that leaves the union gets back its currency and its policy rate, but loses its share of the common protection, and the remaining members can respond.',
          'Announcement → the following year: a new currency, its own central bank, its own rate → floating (the currency adjusts) or pegged (its reserves defend the parity). The remaining members vote on possible retaliation: a tariff on its exports, the sale of its bills held by their central bank.',
          'Cutting its rate: currency ↓ · inflation ↑ at once · GDP ↓ then ↑. A tariff: revenue ↑ so public balance ↑ · imports ↓ so trade balance ↑ · GDP: depends, since your households pay it but part of the demand shifts to your own output. The taxed country sells less: its GDP ↓.',
          'Leaving is irreversible. All of the leaving country’s imports now go through its exchange rate. The common external tariff is voted by the members every year, and the rest of the world can retaliate.',
          'What does freedom over the rate and the currency bring, and what do imported inflation and the others’ reaction cost?'],
        duel: ['The duel',
          'Two identical countries, each with its own currency and central bank, trade only with each other: what one imports is what the other exports.',
          'A stimulates → A imports more → B’s exports ↑. Fixed rate: the deficit country loses reserves, the other gains them. Floating rate: the deficit country’s currency falls. A’s policy rate ↑ → capital flows to A → A’s currency ↑.',
          'Your stimulus: your GDP ↑ and your partner’s ↑, your trade balance ↓. Your rate ↑: investment ↓ the following year · your currency ↑ · inflation ↓.',
          'No vote, no council: each sets its own rate. The climate is shared: one’s emissions damage both economies. A shock sometimes hits one side only and breaks the symmetry.',
          'What will your partner do with what you do?']
      },
      glossary: [
        ['Appreciation, depreciation', 'A floating currency gaining or losing value against others, moved by the market.', 'float duel exit'],
        ['Backstop', 'The central bank buying the public bills nobody else wants, which keeps the risk premium low.', 'debt'],
        ['Carbon intensity', 'Emissions per unit of output; it falls with the carbon tax and green investment.', 'climate'],
        ['Common external tariff', 'A single tax that all union members put on goods bought from the rest of the world.', 'tariffs'],
        ['Competitiveness (price)', 'How cheap your goods are compared with your partners’, in a common currency.', 'compet duel'],
        ['Current account', 'What a country or the union earns from the rest of the world (exports, income received) minus what it pays it (imports, income paid).'],
        ['Cumulative R', 'The sum of the yearly scores since the start of the game; it makes the ranking.'],
        ['Devaluation', 'A decision to lower the value of a fixed currency.', 'deval duel exit'],
        ['Disposable income', 'Income after taxes, benefits included: what households can spend or save.', 'households'],
        ['Fixed or floating exchange rate', 'Fixed: the central bank holds the rate and its reserves absorb the gaps. Floating: the market moves the rate and the reserves are frozen.'],
        ['Foreign reserves', 'The stock of foreign currency held by the central bank to defend a fixed rate.'],
        ['Free riding', 'Benefiting from others’ efforts without contributing.', 'coop climate'],
        ['GDP', 'Everything the country produces in a year; shown as a gap in % from the reference path.'],
        ['Inequality', 'In this game: the wealthy half’s share of the households’ disposable income (54.8 % at the reference), shown as a gap in points.', 'households'],
        ['Inflation', 'The yearly rise in prices, in %.'],
        ['J-curve', 'After a devaluation, the trade balance first worsens (dearer imports at once), then improves (exports catch up a year later).', 'deval float duel exit'],
        ['Leakage', 'The part of income that does not come back into domestic output: saving, taxes, imports.'],
        ['Multiplier', 'The total effect on GDP of one euro of extra spending, larger than one euro because spending becomes income.'],
        ['Policy rate', 'The interest rate set by a central bank; in the union it is common and voted by the members.', 'rate duel exit'],
        ['Propensity to consume', 'The share of each extra euro of income that a household spends rather than saves: higher for the modest half than for the wealthy half.', 'households'],
        ['Propensity to import', 'The share of each euro spent that goes to foreign goods.'],
        ['Public balance', 'Government revenue minus spending, in points of GDP; a minus sign is a deficit.'],
        ['Reference path', 'What the economy would do with no shock and no policy; every result is a gap from it.'],
        ['Risk premium (spread)', 'The extra interest lenders ask from a heavily indebted government.', 'debt duel'],
        ['Sudden stop', 'Foreign investors pulling their money out at once.', 'float'],
        ['TARGET balance', 'What the central bank of a country that left still owes the union’s central bank, or the reverse.', 'exitOn'],
        ['Trade balance', 'Exports minus imports, in points of GDP.'],
        ['Unemployment rate', 'The share of the labour force without a job, in %.']
      ]
    },
    fr: {
      button: 'Comment ça marche ?', title: 'Comment ça marche', close: 'Fermer',
      tabCards: 'Les mécanismes', tabGlossary: 'Lexique',
      intro: 'De courtes fiches sur les mécanismes à l’œuvre dans votre économie : ce qui fait bouger quoi, et dans quel sens. Elles ne disent pas quoi faire — c’est votre choix, et votre justification.',
      glossIntro: 'Les mots du jeu, en termes simples.',
      info: 'Expliquer : ',
      parts: ['En une phrase', 'La chaîne', 'Sur votre score', 'Ce qui peut tout changer', 'La question à vous poser'],
      cards: {
        score: ['Le score R : cinq objectifs qui tirent dans des sens opposés',
          'Chaque année, votre gouvernement est noté sur cinq résultats, mesurés en écart à la trajectoire qu’aurait suivie l’économie sans choc ni politique : PIB, chômage, inflation, solde public, solde commercial.',
          'Écarts de l’année → multipliés par leurs poids → score de l’année R → additionnés année après année → R cumulé, qui fait le classement.',
          'Le PIB, le solde public et le solde commercial comptent en votre faveur ; le chômage et l’inflation contre vous.',
          'Presque toute politique améliore certaines dimensions et en dégrade d’autres : soutenir le PIB coûte souvent du déficit et de l’inflation, assainir les comptes coûte souvent de la croissance. Une élection peut changer les poids en cours de partie. R se juge sur toute la partie : une année faible peut préparer des années meilleures, et l’inverse.',
          'Quelles dimensions êtes-vous prêts à sacrifier cette année, et pour gagner quoi plus tard ?'],
        demand: ['Relancer la demande : le multiplicateur',
          'Un euro de dépense publique devient le revenu de quelqu’un, qui en dépense une partie, qui devient le revenu de quelqu’un d’autre… : l’effet total sur le PIB dépasse la dépense de départ.',
          'Dépense ↑ → production ↑ → revenus ↑ → consommation ↑ → production ↑… Chaque tour est plus petit que le précédent, à cause des fuites ([[leaks]]).',
          'PIB ↑ · chômage ↓ · inflation ↑ · solde public ↓ (la dépense en plus, en partie compensée par les recettes qu’apporte la croissance) · solde commercial ↓.',
          'Les trois instruments n’agissent pas pareil. La demande publique entre directement dans la production. Les prestations et une baisse d’impôt sur le revenu passent d’abord par le revenu des ménages, qui en épargnent une part. Une relance ponctuelle s’estompe : les ménages reconstituent leur patrimoine, puis la consommation se stabilise. Une réduction des dépenses agit dans l’autre sens, avec les mêmes flèches inversées.',
          'Quel instrument touche le plus directement la production, et lequel pèse le plus sur le budget pour le même effet ?'],
        leaks: ['Les fuites : votre relance fait les exportations de vos voisins',
          'Une partie de chaque euro de revenu ne revient pas dans la production nationale : elle est épargnée, prélevée en impôts, ou dépensée en importations.',
          'Revenus ↑ → importations ↑ → une partie de la demande part chez les partenaires de l’union (leurs exportations ↑) et une partie vers le reste du monde (solde courant de l’union ↓, réserves communes ↓).',
          'Votre solde commercial ↓ · votre PIB ↑ moins que si tout restait chez vous · le PIB de vos partenaires ↑.',
          'Si tous les membres relancent ensemble, chacun récupère une partie des fuites des autres. Si un seul relance, il paie le déficit et partage le gain. À l’inverse, un pays peut profiter de la relance des autres sans rien dépenser ([[coop]]). La part qui part vers le reste du monde vide les réserves de toute l’union ([[reserves]]).',
          'Quelle part de votre effort restera chez vous, et que feront vos voisins ?'],
        vat: ['La taxe sur la consommation (TVA)',
          'La TVA s’ajoute au prix de ce que les ménages achètent : elle rapporte au budget, mais elle passe dans les prix et réduit les volumes consommés.',
          'TVA ↑ → prix ↑ l’année du changement → pouvoir d’achat ↓ → consommation en volume ↓ → production ↓ et importations ↓.',
          'Solde public ↑ · PIB ↓ · chômage ↑ · inflation ↑ l’année du changement, puis elle retombe (le niveau des prix, lui, reste plus haut) · solde commercial ↑.',
          'L’effet sur l’inflation est ponctuel, l’effet sur le budget dure. Une baisse de TVA fait l’inverse : un peu de pouvoir d’achat et moins d’inflation l’année où elle a lieu.',
          'À quel moment de la partie un à-coup d’inflation vous coûte-t-il le moins ?'],
        rate: ['Le taux de la banque centrale',
          'Le taux commun fixe le coût du crédit pour les entreprises et le coût de la dette pour chaque État ; les membres votent pour le faire bouger.',
          'Taux ↑ → l’année suivante : investissement ↓ → production ↓ ; intérêts payés sur la dette publique ↑ → déficit ↑. Les ménages touchent un peu plus d’intérêts, un effet légèrement expansionniste, plus faible.',
          'Cette année : presque rien. L’année suivante : PIB ↓ · chômage ↑ · inflation ↓ · solde public ↓ · solde commercial ↑. Une baisse de taux fait l’inverse.',
          'Le délai d’un an : ce que vous votez maintenant pèse sur l’année prochaine. Le taux est commun : un pays très endetté et un pays peu endetté ne le ressentent pas de la même façon. Un changement voté reste en place jusqu’au vote suivant.',
          'Quel sera votre besoin l’année prochaine, et celui de vos partenaires ?'],
        reserves: ['Les réserves de change et la contrainte extérieure',
          'Avec un change fixe, la banque centrale commune couvre le déficit courant de l’union avec le reste du monde en vendant ses réserves de devises ; ce stock est commun à tous les membres.',
          'Importations du reste du monde ↑ ou exportations ↓ → solde courant de l’union ↓ → réserves ↓ → sous 25 % du stock initial : alerte → l’année suivante s’ouvre par un vote, austérité ou dévaluation (dans le modèle Finance, aussi le change flottant) → réserves épuisées avec un déficit persistant : dévaluation forcée.',
          'Austérité : PIB ↓ · chômage ↑ · inflation ↓ · solde public ↑ · solde commercial ↑. Dévaluation : voir [[deval]].',
          'Le déficit de chacun vide le stock de tous : un membre qui relance seul fait payer les autres. Un gros choc peut vider les réserves sans passer par l’alerte.',
          'Combien d’années tiennent les réserves au rythme actuel, et qui creuse le déficit ?'],
        deval: ['La dévaluation en change fixe',
          'Dévaluer rend la monnaie de l’union moins chère : les importations coûtent plus cher tout de suite, les exportations deviennent plus compétitives, mais avec un délai.',
          'Dévaluation → cette année : prix des importations ↑ → inflation ↑, facture des importations ↑ → solde courant ↓ (la courbe en J) → l’année suivante : exportations ↑, importations ↓ → solde courant ↑, PIB ↑.',
          'Cette année : inflation ↑ · solde commercial ↓ · PIB ↓. Les années suivantes : solde commercial ↑ · PIB ↑ · chômage ↓.',
          'L’inflation que provoque la dévaluation reprend une partie du gain de compétitivité. La dévaluation touche tous les membres en même temps.',
          'Votre score peut-il encaisser la mauvaise année avant les bonnes ?'],
        coop: ['Jouer avec les autres : coordination et passager clandestin',
          'Ce que font vos partenaires pèse sur vos résultats, et ce que vous faites pèse sur les leurs.',
          'Un partenaire relance → il importe plus → vos exportations ↑ → votre PIB ↑ sans coût pour votre budget. Tout le monde attend que les autres relancent → personne ne relance.',
          'Laisser les autres agir peut améliorer votre R à court terme ; si tous font de même, tous y perdent.',
          'Au conseil, les engagements sont publics, les décisions restent secrètes jusqu’à la clôture : on peut promettre et ne pas tenir, et l’administrateur peut le révéler. Le vote de taux se gagne à la majorité, le vote de crise des réserves par le choix médian : une alliance compte.',
          'Qu’attendez-vous de vos partenaires, et qu’êtes-vous prêts à promettre en échange ?'],
        decomp: ['Lire ses résultats : la décomposition « dont »',
          'Chaque résultat est décomposé entre ce qu’a fait votre propre politique, ce qu’ont fait les politiques des autres pays et ce qu’ont fait les chocs.',
          'Le modèle rejoue l’année plusieurs fois : avec les chocs seuls, puis avec votre politique en plus, puis avec tout. Les écarts entre ces simulations donnent les lignes « dont ».',
          'La ligne « dont votre propre politique » est celle que vous maîtrisez ; les autres expliquent ce qui vous est arrivé.',
          'Un mauvais total peut cacher une bonne politique (le choc était plus fort), et l’inverse. Les effets d’une année se prolongent sur les suivantes.',
          'L’écart entre ce que vous attendiez et ce qui s’est passé vient-il de votre politique, des autres ou des chocs ?'],
        compet: ['La compétitivité-prix',
          'Un pays dont les prix montent plus vite que ceux de ses partenaires devient plus cher : il vend moins et achète plus à l’étranger, un an plus tard, et l’écart s’accumule.',
          'Inflation chez vous plus forte que chez les autres → niveau relatif des prix ↑ → l’année suivante : exportations ↓, importations ↑ → production ↓.',
          'Avec le temps : solde commercial ↓ · PIB ↓ · chômage ↑. À l’inverse, moins d’inflation que les autres améliore peu à peu le solde commercial.',
          'Dans une union il n’y a pas de taux de change interne : si un pays perd en compétitivité, seule une inflation plus faible que chez ses partenaires la lui rend. C’est la dévaluation interne, et elle passe par une demande plus faible. L’effet d’une relance s’érode donc d’année en année.',
          'Votre politique de cette année vous rend-elle plus cher ou moins cher que vos voisins pour les années suivantes ?'],
        float: ['Taux, capitaux et change flottant',
          'Les capitaux vont là où ils sont le mieux rémunérés ; en change flottant, ce sont leurs entrées et leurs sorties qui font monter ou baisser la monnaie, et non plus les réserves qui les absorbent.',
          'Taux de l’union ↑ (ou taux mondial ↓) → capitaux entrants → monnaie ↑ (appréciation) → importations moins chères, exportations moins compétitives. Sortie de capitaux (arrêt brutal) → monnaie ↓ (dépréciation) → importations plus chères tout de suite, exportations plus compétitives avec un délai.',
          'Une dépréciation : inflation ↑ tout de suite · solde commercial ↓ puis ↑ · PIB : ça dépend de l’année. Une appréciation fait l’inverse : inflation ↓, puis compétitivité ↓.',
          'En change fixe, les mêmes flux passent par les réserves au lieu de la monnaie ([[reserves]]). Si la monnaie perd beaucoup en un an, l’union vote : défendre la monnaie (le taux monte cette année, ce qui fait revenir les capitaux mais freine l’investissement et pèse sur la dette l’année suivante) ou la laisser flotter (rien n’est fait, l’inflation importée reste). Un arrêt brutal qui dure doit être répété chaque année par l’administrateur.',
          'Qu’est-ce qui vous coûte le plus cette année : l’inflation importée ou un taux plus élevé l’an prochain ?'],
        debt: ['Dette, prime de risque et filet de sécurité',
          'Au-delà d’un certain niveau de dette, les prêteurs privés demandent un taux plus élevé pour détenir les titres d’un État : c’est la prime de risque.',
          'Déficits répétés → dette ↑ → au-delà du seuil : prime de risque ↑ → intérêts ↑ → déficit ↑ → dette ↑. Les détenteurs étrangers se détournent vers les membres moins endettés.',
          'Solde public ↓ · PIB ↓ si le budget doit se resserrer.',
          'Avec le filet de sécurité, la banque centrale achète les titres que personne d’autre ne veut, au taux commun : la prime reste faible. Sans filet (décision de l’administrateur), le taux monte jusqu’à ce que les ménages et les banques absorbent la dette, et la fuite des capitaux vide les réserves de l’union.',
          'À quelle distance du seuil êtes-vous, et que se passe-t-il si le filet disparaît ?'],
        climate: ['Le climat : dommages, taxe carbone, investissement vert',
          'La production émet ; les émissions s’accumulent dans un stock mondial qui endommage l’économie de tous, que chacun ait émis beaucoup ou peu.',
          'Production → émissions → stock de pollution ↑ → dommages ↑ → production potentielle ↓ → chômage structurel ↑ et inflation ↑ pour tous les membres. Taxe carbone ou investissement vert → intensité carbone ↓ l’année suivante → émissions ↓.',
          'Taxe carbone : solde public ↑ · inflation ↑ l’année où elle change · PIB ↓ · émissions ↓ ensuite. Investissement vert : PIB ↑ · solde public ↓ · solde commercial ↓ (l’équipement est en grande partie importé) · émissions ↓ ensuite, de moins en moins à mesure qu’on en ajoute.',
          'Les émissions ne comptent dans R que si une élection leur donne un poids. Les dommages se voient, eux, dans le chômage et l’inflation de tous. Un pays qui réduit seul ses émissions paie tout le coût et ne reçoit qu’une petite part du bénéfice : c’est un bien public. Le reste du monde émet aussi.',
          'Qui paie l’effort, qui en profite, et quand ?'],
        households: ['Ménages modestes et aisés : qui reçoit quoi',
          'La population est coupée en deux moitiés : la moitié modeste vit d’environ un tiers des salaires et des prestations sociales, et dépense presque tout ; la moitié aisée reçoit le reste des salaires et tous les revenus du capital, paie l’impôt sur le revenu et épargne davantage.',
          'Prestations ↑ → revenu de la moitié modeste ↑ → presque entièrement dépensé → demande ↑, plus que pour une baisse d’impôt du même montant. Impôt sur le revenu ↓ → revenu de la moitié aisée ↑ → une plus grande part épargnée → demande ↑, mais moins. La croissance augmente les salaires et les profits ; les prestations, elles, ne bougent pas.',
          'Prestations ↑ : inégalités ↓ · PIB ↑ · solde public ↓. Impôt sur le revenu ↑ : inégalités ↓ · PIB ↓ · solde public ↑. Impôt sur le revenu ↓ : inégalités ↑. Demande publique ↑ : PIB ↑ · inégalités ↑ (salaires et profits progressent, les prestations non). Taux de l’union ↑ : inégalités ↑ (les intérêts vont à la moitié aisée).',
          'Les inégalités ne comptent dans R que si l’administrateur ou une élection leur donne un poids. Taxer la moitié aisée pour verser des prestations à la moitié modeste peut soutenir la demande sans déficit, car la moitié modeste dépense une plus grande part de chaque euro.',
          'Qui paie votre politique, qui en profite, et cela change-t-il ce qu’ils dépensent ?'],
        exit: ['Sortie de l’union et droits de douane',
          'Un pays qui quitte l’union retrouve sa monnaie et son taux directeur, mais perd sa part du stock commun de protection, et les autres membres peuvent lui répondre.',
          'Annonce → l’année suivante : nouvelle monnaie, propre banque centrale, propre taux → change flottant (la monnaie s’ajuste) ou ancré (ses réserves défendent la parité). Les membres restants votent d’éventuelles représailles : droit de douane sur ses exportations, vente de ses titres détenus par leur banque centrale.',
          'Baisser son taux : monnaie ↓ · inflation ↑ tout de suite · PIB ↓ puis ↑. Un droit de douane : recettes ↑ donc solde public ↑ · importations ↓ donc solde commercial ↑ · PIB : ça dépend, car ce sont vos ménages qui le paient, mais une partie de la demande se reporte sur votre production. Le pays taxé vend moins : son PIB ↓.',
          'La sortie est irréversible. Toutes les importations du pays sortant passent désormais par son taux de change. Le tarif extérieur commun est voté par les membres chaque année, et le reste du monde peut répliquer.',
          'Qu’apporte la liberté de taux et de change, et que coûtent l’inflation importée et la réaction des autres ?'],
        duel: ['Le duel',
          'Deux pays identiques, chacun avec sa monnaie et sa banque centrale, ne commercent qu’entre eux : ce que l’un importe est ce que l’autre exporte.',
          'A relance → A importe plus → les exportations de B ↑. En change fixe : le pays en déficit perd des réserves, l’autre en gagne. En change flottant : la monnaie du pays en déficit baisse. Taux directeur de A ↑ → capitaux vers A → monnaie de A ↑.',
          'Votre relance : votre PIB ↑ et celui de votre partenaire ↑, votre solde commercial ↓. Votre taux ↑ : investissement ↓ l’année suivante · votre monnaie ↑ · inflation ↓.',
          'Pas de vote, pas de conseil : chacun fixe son propre taux. Le climat est partagé : les émissions de l’un endommagent l’économie des deux. Un choc ne frappe parfois qu’un côté et rompt la symétrie.',
          'Que fera votre partenaire de ce que vous faites ?']
      },
      glossary: [
        ['Appréciation, dépréciation', 'Une monnaie flottante qui gagne ou perd de la valeur face aux autres, sous l’effet du marché.', 'float duel exit'],
        ['Arrêt brutal', 'Des investisseurs étrangers qui retirent leur argent d’un coup.', 'float'],
        ['Balance commerciale, solde commercial', 'Exportations moins importations, en points de PIB.'],
        ['Chômage (taux de)', 'La part de la population active sans emploi, en %.'],
        ['Compétitivité-prix', 'Le prix de vos biens comparé à celui de vos partenaires, en monnaie commune.', 'compet duel'],
        ['Courbe en J', 'Après une dévaluation, le solde commercial se dégrade d’abord (importations plus chères tout de suite), puis s’améliore (les exportations rattrapent un an plus tard).', 'deval float duel exit'],
        ['Change fixe, change flottant', 'Fixe : la banque centrale tient le taux et ses réserves absorbent les écarts. Flottant : le marché fait bouger le taux et les réserves sont gelées.'],
        ['Dévaluation', 'La décision de baisser la valeur d’une monnaie à change fixe.', 'deval duel exit'],
        ['Filet de sécurité', 'La banque centrale qui achète les titres publics dont personne ne veut, ce qui garde la prime de risque basse.', 'debt'],
        ['Fuite', 'La part du revenu qui ne revient pas dans la production nationale : épargne, impôts, importations.'],
        ['Inégalités', 'Dans le jeu : la part de la moitié aisée dans le revenu disponible des ménages (54,8 % à la référence), affichée en écart en points.', 'households'],
        ['Inflation', 'La hausse des prix sur un an, en %.'],
        ['Intensité carbone', 'Les émissions par unité produite ; elle baisse avec la taxe carbone et l’investissement vert.', 'climate'],
        ['Multiplicateur', 'L’effet total sur le PIB d’un euro de dépense en plus, supérieur à un euro parce que la dépense devient du revenu.'],
        ['Passager clandestin', 'Profiter des efforts des autres sans y contribuer.', 'coop climate'],
        ['PIB', 'Tout ce que le pays produit en un an ; affiché en écart en % à la trajectoire de référence.'],
        ['Prime de risque (spread)', 'Le supplément d’intérêt que les prêteurs exigent d’un État très endetté.', 'debt duel'],
        ['Propension à consommer', 'La part de chaque euro de revenu supplémentaire qu’un ménage dépense au lieu de l’épargner : plus forte pour la moitié modeste que pour la moitié aisée.', 'households'],
        ['Propension à importer', 'La part de chaque euro dépensé qui va à des biens étrangers.'],
        ['R cumulé', 'La somme des scores annuels depuis le début de la partie ; c’est lui qui fait le classement.'],
        ['Réserves de change', 'Le stock de devises détenu par la banque centrale pour défendre un change fixe.'],
        ['Revenu disponible', 'Le revenu après impôts, prestations comprises : ce que les ménages peuvent dépenser ou épargner.', 'households'],
        ['Solde courant', 'Ce qu’un pays ou l’union gagne du reste du monde (exportations, revenus reçus) moins ce qu’il lui verse (importations, revenus versés).'],
        ['Solde public', 'Recettes moins dépenses de l’État, en points de PIB ; un signe moins est un déficit.'],
        ['Solde TARGET', 'Ce que la banque centrale d’un pays sorti doit encore à celle de l’union, ou l’inverse.', 'exitOn'],
        ['Tarif extérieur commun', 'Une même taxe que tous les membres de l’union mettent sur les biens achetés au reste du monde.', 'tariffs'],
        ['Taux directeur', 'Le taux d’intérêt fixé par une banque centrale ; dans l’union il est commun et voté par les membres.', 'rate duel exit'],
        ['Trajectoire de référence', 'Ce que ferait l’économie sans choc ni politique ; chaque résultat est un écart à elle.']
      ]
    }
  };

  /* ---------- rendering ---------- */
  var state = null, panel = null, btn = null, current = null, watching = false;
  function L() { return T[(window.MXL && MXL.lang === 'fr') ? 'fr' : 'en']; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function typo(s) { return (window.MXL && MXL.lang === 'fr') ? s.replace(/ ([:;?!»])/g, ' $1').replace(/« /g, '« ').replace(/(\d) %/g, '$1 %') : s; }
  function visible() { return ORDER.filter(function (id) { return enabled() && SHOW[id](state); }); }
  function enabled() { return !!state && !(state.sim && state.sim.guide === false); }
  /* [[id]] = « card n » / « fiche n », a link to that card; plain words when the class does not see it */
  function text(s) {
    var vis = visible(), fr = window.MXL && MXL.lang === 'fr';
    return typo(esc(s)).replace(/\[\[(\w+)\]\]/g, function (m, id) {
      var k = vis.indexOf(id);
      if (k < 0) return fr ? 'fiche « ' + esc(L().cards[id][0]) + ' »' : 'card « ' + esc(L().cards[id][0]) + ' »';
      return '<a href="#" class="glink" data-card="' + id + '">' + (fr ? 'fiche ' : 'card ') + (k + 1) + '</a>';
    });
  }

  function build() {
    if (panel) panel.remove();
    var l = L(), vis = visible();
    panel = document.createElement('aside');
    panel.id = 'guidePanel'; panel.setAttribute('translate', 'no'); panel.setAttribute('aria-label', l.title); panel.hidden = true;
    var h = '<div class="gp-head"><h2>' + esc(l.title) + '</h2><button type="button" class="gp-close" aria-label="' + esc(l.close) + '">×</button></div>' +
      '<div class="gp-tabs" role="tablist"><button type="button" role="tab" data-tab="cards" aria-selected="true">' + esc(l.tabCards) + '</button><button type="button" role="tab" data-tab="glossary" aria-selected="false">' + esc(l.tabGlossary) + '</button></div>' +
      '<div class="gp-body" data-pane="cards"><p class="gp-intro">' + typo(esc(l.intro)) + '</p>';
    vis.forEach(function (id, k) {
      var c = l.cards[id];
      h += '<details class="gcard" data-card="' + id + '"><summary><span class="gn">' + (k + 1) + '</span>' + typo(esc(c[0])) + '</summary><dl>';
      for (var i = 0; i < 5; i++) h += '<dt>' + esc(l.parts[i]) + '</dt><dd>' + text(c[i + 1]) + '</dd>';
      h += '</dl></details>';
    });
    h += '</div><div class="gp-body" data-pane="glossary" hidden><p class="gp-intro">' + typo(esc(l.glossIntro)) + '</p><dl class="gloss">';
    l.glossary.filter(wordShown).forEach(function (g) { h += '<dt>' + typo(esc(g[0])) + '</dt><dd>' + typo(esc(g[1])) + '</dd>'; });
    h += '</dl></div>';
    panel.innerHTML = h;
    document.body.appendChild(panel);
    panel.querySelector('.gp-close').addEventListener('click', close);
    Array.prototype.forEach.call(panel.querySelectorAll('[data-tab]'), function (b) { b.addEventListener('click', function () { tab(b.getAttribute('data-tab')); }); });
    /* one card open at a time */
    Array.prototype.forEach.call(panel.querySelectorAll('details.gcard'), function (d) {
      d.addEventListener('toggle', function () { if (d.open) Array.prototype.forEach.call(panel.querySelectorAll('details.gcard[open]'), function (o) { if (o !== d) o.open = false; }); });
    });
    panel.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a.glink'); if (a) { e.preventDefault(); show(a.getAttribute('data-card')); } });
    current = (window.MXL && MXL.lang) + '|' + vis.join(',');
  }
  /* a glossary word is shown when the class sees one of its cards (third item; none = always) */
  function wordShown(g) {
    if (!g[2]) return true;
    var vis = visible();
    return g[2].split(' ').some(function (k) {
      if (k === 'tariffs') return !isDuel(state) && !!(state && state.sim && state.sim.tariffs);
      if (k === 'exitOn') return !isDuel(state) && !!(state && state.sim && state.sim.exit) && finance(state);
      return vis.indexOf(k) >= 0;
    });
  }
  function tab(name) {
    Array.prototype.forEach.call(panel.querySelectorAll('[data-tab]'), function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === name)); });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-pane]'), function (p) { p.hidden = p.getAttribute('data-pane') !== name; });
  }
  function open() { if (!panel) build(); panel.hidden = false; document.body.classList.add('guide-open'); panel.querySelector('.gp-close').focus(); }
  function close() { if (panel) panel.hidden = true; document.body.classList.remove('guide-open'); if (btn) btn.focus(); }
  function show(id) {
    open(); tab('cards');
    var d = panel.querySelector('details.gcard[data-card="' + id + '"]'); if (!d) return;
    d.open = true; d.scrollIntoView({ block: 'start' });
  }

  /* the ⓘ next to every anchor of a visible card */
  function decorate(root) {
    if (!enabled()) return;
    var vis = visible(), l = L();
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-guide]'), function (elx) {
      var hint = elx.querySelector(':scope > .hint');
      elx.getAttribute('data-guide').split(' ').forEach(function (id) {
        if (vis.indexOf(id) < 0 || elx.querySelector(':scope > .gi[data-card="' + id + '"]')) return;
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'gi'; b.textContent = 'i'; b.setAttribute('translate', 'no'); b.setAttribute('data-card', id);
        b.title = l.info + l.cards[id][0]; b.setAttribute('aria-label', b.title);
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); show(id); });
        if (hint) elx.insertBefore(b, hint); else elx.appendChild(b);
      });
    });
  }

  /* called by the desk after every render, with the class state */
  function update(st) {
    state = st;
    if (!btn) {
      btn = document.getElementById('guideBtn');
      if (btn) btn.addEventListener('click', function () { if (panel && !panel.hidden) close(); else open(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel && !panel.hidden) close(); });
    }
    if (btn) btn.hidden = !enabled();
    if (!watching && window.MutationObserver) {   /* parts of the page redrawn later get their ⓘ too */
      watching = true; var pending = false;
      new MutationObserver(function () { if (pending) return; pending = true; setTimeout(function () { pending = false; decorate(document); }, 0); })
        .observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
    }
    if (!enabled()) {
      if (panel) { panel.remove(); panel = null; }
      document.body.classList.remove('guide-open');
      Array.prototype.forEach.call(document.querySelectorAll('.gi'), function (b) { b.remove(); });
      return;
    }
    if (panel && current !== (window.MXL && MXL.lang) + '|' + visible().join(',')) { var was = !panel.hidden; build(); if (was) open(); }
    var vis = visible();
    Array.prototype.forEach.call(document.querySelectorAll('.gi[data-card]'), function (b) { if (vis.indexOf(b.getAttribute('data-card')) < 0) b.remove(); });
    decorate(document);
  }
  return { update: update, show: show, cards: function () { return visible(); }, TEXT: T };
})();
