# §12 (proposition, révision 2 du 07/11) — Sortie de l'union monétaire

Statut : **proposition**, rien n'est codé. Validé par Léo le 07/11 : bilans à la sortie (12.3) avec redénomination de **toute** la dette publique, y compris celle détenue par le reste du monde ; soldes TARGET ; sortie unilatérale ; régime de change choisi par le pays sortant. Pas de coûts de transition automatiques : ils passent par des chocs administrateur et par un conseil de représailles (12.5). Les ordres de grandeur marqués « cible » sont à mesurer avec `dev/engine-test.js` ; ceux marqués « mesuré » viennent de l'état de référence actuel (v2.0).

## 12.0 État actuel

Le champ `euro: 'none'|'leave'|'join'` existe dans les décisions (`core.js`, hérité de MacSim), la case `game.allowEuro` aussi (Control → Parameters), le formulaire étudiant l'affiche et le backend le valide. **Le moteur ne le lit pas** : une équipe qui « sort » reste dans l'union. À ne pas activer en séance avant cette version.

## 12.1 Objectif pédagogique

Montrer ce qu'une sortie rend (un taux et un change à soi, la dévaluation externe au lieu de la dévaluation interne), ce qu'elle coûte (inflation importée, perte de la part des réserves communes, solde TARGET, réaction des marchés et des partenaires) et ce qu'elle impose aux autres (commerce, réserves, votes). Les coûts qui dépendent des réactions (marchés, partenaires) ne sont pas automatiques : l'administrateur et le conseil les décident, ce qui en fait un objet de négociation.

## 12.2 Règle de jeu

- **Décision unilatérale** de l'équipe : choix `leave` avec les décisions de l'année N (secret tant que le tour est ouvert, révélé à la publication comme les votes). Pas de vote du conseil sur la sortie elle-même.
- **Calendrier** : N est l'année de l'annonce (le pays est encore membre). La sortie est **effective au 1er janvier de N+1** : nouvelle monnaie, banque centrale nationale. Au début de N+1, avant les décisions, se tient le **conseil de représailles** (12.5).
- **Irréversible** dans la partie (pas de `join`).
- **Après la sortie**, le pays : choisit chaque année son **régime de change** (flottant ou parité contre l'euro) et, en parité, peut dévaluer ou réévaluer (12.4) ; obtient le levier `rate` du mode duel (points autour de r*, ±2, pas 0,25) ; garde les six autres leviers ; ne vote plus au conseil (taux, crise de réserves, crise de change) — les majorités se comptent sur les membres restants ; reste classé avec le même R.
- **Disponibilité** : classes v1.3 et v2.0 seulement (il faut le compte financier et le change flottant de §9). Pas en v1.1/v1.2, pas en duel. Activation par classe : `sim.exit = true` (Control → Parameters), qui remplace `game.allowEuro`.

## 12.3 Bilans au moment de la sortie (début de N+1) — validé

Notation : X le pays sortant, NC sa nouvelle monnaie, `e_X` = prix d'un euro en NC (`e_X` ↑ = dépréciation de la NC), `e_X = 1` à la sortie.

**Redénomination 1 pour 1 de toute la dette publique et de tout ce qui relève du droit national** : billets `H_X`, dépôts `M_X`, prêts `L_X`, titres publics détenus par les ménages `Bh_X`, les banques `Bb_X`, la banque centrale `Bcb_X` **et le reste du monde `Bw_X`**, avances `A_X`. Aucun effet de richesse à la sortie.

**Ce qui reste en monnaie étrangère** : les titres étrangers des ménages `Bf_X` (en monnaie mondiale), le solde TARGET (en euros, ci-dessous).

**Conséquences de la redénomination de `Bw_X`** (mesuré à la référence : `Bw_X` = 15 % du PIB, `Bf_X` = 15 % du PIB) :
- la dette publique de X est entièrement en NC : une dépréciation ne l'alourdit pas ; le ratio dette/PIB et la prime de risque de §9.6 ne bougent que par les flux ;
- une dépréciation **améliore** la position extérieure nette de X : ses avoirs (`Bf_X`) prennent de la valeur en NC, ses engagements envers le reste du monde (`Bw_X`) n'en prennent pas. Une dépréciation de 20 % ≈ +3 points de PIB de position nette, au profit des ménages ;
- le perdant est le **reste du monde**, dont la créance sur X se déprécie avec la NC. Pour lui, c'est un défaut partiel : la raison naturelle d'une vente des titres de X, que l'administrateur peut déclencher (12.5).

**Banque centrale nationale (BCN_X)** : reprend `H_X` au passif, `Bcb_X` et `A_X` à l'actif, plus une **part des réserves communes** `R_X = R · Y*_X / ΣY*` (clé de capital = taille de référence). Le solde de son bilan est un **solde TARGET** envers la banque centrale de l'union, en euros :

```
T2_X = H_X − Bcb_X − A_X − xr · R_X          (en euros, à la date de sortie ; > 0 : BCN_X doit à l'union)
```

Mesuré : à la référence `H − Bcb − A` = 3,7 % du PIB pour chaque membre, et la part des réserves par la taille = 3,75 % → **T2 ≈ 0 à la référence**. Il devient non nul quand X a creusé (ou financé) le déficit extérieur de l'union pendant la partie : un pays qui a « consommé » les réserves communes sort avec une dette TARGET. `T2_X` est un stock en euros, rémunéré au taux de l'union `r`, non remboursé sauf décision du conseil (12.5). Comme il est en euros, une dépréciation de la NC alourdit la dette TARGET de la BCN_X (perte en capital de la BCN, dans `NWcb_X`).

**Union** : `R` diminue de `R_X` ; la banque centrale de l'union porte `T2_X` en créance (ou dette) sur la BCN_X. Identité de l'union (sans X) : `Σ_{i≠X} H_i = Σ_{i≠X} (Bcb_i + A_i) + xr · R + T2_X − NWcb`.

## 12.4 Le change du pays sorti

### Un seul prix à résoudre, deux taux à lire

X échange avec deux partenaires qui ont chacun leur monnaie : l'union (euro) et le reste du monde (monnaie mondiale). Il y a donc deux taux de change pour X :
- `e_X` : prix d'un euro en NC — **c'est le taux que X choisit de laisser flotter ou de fixer** ;
- `e_X · xr` : prix d'une unité de monnaie mondiale en NC — **le taux croisé**, qui n'est pas choisi séparément. Il découle de `e_X` et du taux de l'union `xr` (prix de la monnaie mondiale en euros). Par arbitrage, il n'existe qu'un prix du dollar en NC : celui qu'on obtient en passant par l'euro.

Conséquence : X ne contrôle que `e_X`. Si l'union se déprécie contre le monde (`xr` ↑), la NC se déprécie aussi contre le monde, du même pourcentage, à `e_X` donné. C'est la situation du Danemark ou de la Bulgarie aujourd'hui.

### Régime flottant

La BCN_X n'intervient pas : ses réserves `R_X` sont gelées. `e_X` est le prix qui équilibre la balance des paiements de X, chaque année, conjointement avec les PIB (comme `xr` en v1.3) :

```
CA'_X(e_X) + KA_X(e_X) = 0
CA'_X = X_X − e_X·IMU_X − e_X·xr·IMR_X + r_w,−1·e_X·xr·Bf_X,−1 − (r_X,−1 + s_X,−1)·Bw_X,−1 − r_−1·e_X·T2_X
KA_X  = ΔBw_X − e_X·xr·ΔBf_X
```

Ce qui fait bouger `e_X` : ses déficits commerciaux (avec l'union et avec le monde), l'écart de son taux `r_X` avec ceux de l'union et du monde (flux de capitaux), les chocs de l'administrateur (12.5). Une baisse de `r_X` de 1 point fait sortir des capitaux et déprécie la NC ; ordre de grandeur cible : 5 à 8 % (calibrage du duel : ≈ 7 % par point).

Si l'union flotte elle aussi, les deux prix `xr` et `e_X` sont résolus ensemble chaque année (boucle externe sur `xr`, boucle interne sur `e_X`, encadrement + sécante comme aujourd'hui).

### Régime de parité (« parité en variante »)

X fixe `e_X` contre l'euro — un currency board ou un système type mécanisme de change européen. La BCN_X défend la parité avec ses réserves `R_X` (la part reçue à la sortie) : elle achète ou vend de la NC pour que `e_X` ne bouge pas, et ses réserves absorbent le solde de la balance des paiements :

```
e_X donné (parité choisie par l'équipe)
R_X = R_X,−1 + (CA'_X + KA_X) / (e_X · xr)
```

- **Parité de départ** : 1 (la conversion 1 pour 1), ou le dernier `e_X` si X passait du flottant à la parité.
- **Dévaluation ou réévaluation** : décision de l'équipe (champ `peg` : variation de la parité en %, bornée ±20), effective l'année même.
- **Alerte** : `R_X < 25 %` de sa part initiale, affichée au pays sorti.
- **Épuisement** (`R_X ≤ 0` et déficit à la fin de N) : dévaluation forcée de 15 % en N+1, comme en duel, sans vote.
- Le taux croisé contre le monde suit toujours l'union : `e_X · xr`.

La parité garde l'ancrage (pas d'inflation importée venant de l'union) mais redonne une contrainte de réserves, sans les réserves communes. Le flottant supprime la contrainte de réserves mais fait varier les prix à l'importation.

### Choix du régime

Décision de l'équipe X chaque année, dans son formulaire (champ `fx: 'float'|'peg'`, défaut `float`, plus `peg` pour une variation de parité). Le passage flottant → parité fige le taux de l'année précédente ; parité → flottant libère `e_X` et gèle `R_X`.

### Autres équations de X après la sortie

Mêmes équations qu'un membre de v1.3/v2.0, avec :

**Taux** : `r_X = r* + rate_X/100` (levier), plus la prime `s_X` de §9.6 sur la dette en NC. Le choc de taux de l'administrateur et le vote de la BCE ne touchent plus X.

**Commerce** — même convention que pour le reste du monde aujourd'hui (prix en monnaie du producteur, effets prix avec un an de retard, élasticités inchangées) :
```
importations de X depuis j ∈ union :  volume IMU_Xj = (1 − sR)·μ·Y_X · s_Xj · (e_X,−1 · Prel_j,−1 / Prel_X,−1)^(−εU)                 coût en NC : e_X · IMU_Xj
importations de j depuis X :          volume IMU_jX = (1 − sR)·μ·Y_j · s_jX · ((1 + tU)·Prel_X,−1 / (e_X,−1 · Prel_j,−1))^(−εU)    coût en euros : IMU_jX / e_X
importations de X depuis le RdM :     IMR_X = sR·μ·Y_X · (e_X,−1·xr_−1 / (xr0·Prel_X,−1))^(−ε)                                    coût en NC : e_X·xr·IMR_X
exportations de X vers le RdM :       XR_X = xR*_X · monde · (e_X·xr / (xr0·Prel_X,−1))^η
```
`tU` : tarif de représailles de l'union sur les importations venant de X (12.5), 0 par défaut ; recette versée aux gouvernements des membres importateurs.

**Inflation** (thermomètre) : la transmission du change vaut désormais pour toutes les importations de X, au même degré par unité de part importée qu'aujourd'hui :
```
π_X = … + ω · 100·Δ(e_X·xr)/(e_X·xr)_−1 + ω·((1 − sR)/sR) · 100·Δe_X/e_X,−1
```
Avec sR = 0,5 (mesuré), une dépréciation de 10 % de la NC contre l'euro ajoute ≈ 3 points d'inflation l'année même. Elle est nulle en parité tenue contre l'euro (seul `xr` joue).

**Portefeuilles** : ménages de X : `λF = λF0 + λf1·(r_w − r_X − s_X)` (anticipations statiques, comme ch. 12). Reste du monde : demande de titres de X, en NC, `Bw_X = e_X · xr · Bw$*_X · (1 + χw·(r_X − r_w) − χs·s_X) · (1 + flowsX/100)`, avec `flowsX` le choc administrateur propre à X (12.5).

**Union** : ses échanges avec X deviennent extérieurs. Son compte courant inclut le solde avec X et les intérêts sur `T2_X` ; en fixe, `R` absorbe tout le solde extérieur de l'union (RdM et X) ; en flottant, `xr` le solde. Les agrégats de l'union (PIB, niveau des prix, alerte, mois d'importations) excluent X à partir de N+1.

## 12.5 Ce qui rend la sortie difficile : administrateur et conseil

Aucun coût automatique. Deux sources, au choix de l'administrateur et des autres équipes.

### Chocs administrateur propres au pays sorti

Nouvelles lignes de l'éditeur de chocs, actives dès qu'une sortie est annoncée, par année (y compris l'année d'annonce N), appliquées à X seulement :

| Choc | Effet | Exemple |
|---|---|---|
| `exitConfidence` (%) | propension à consommer des ménages de X, `α1 × (1 + exitConfidence/100)` | −3 en N+1 |
| `exitFlows` (%) | demande du reste du monde pour les titres de X (`flowsX`) : vente des titres redénominés | −20 en N+1 |
| `exitRun` (points de richesse) | l'année d'annonce, les ménages de X sortent leurs dépôts vers les titres étrangers (`λF0_X + exitRun`) ; en change fixe, ce sont les réserves communes qui paient | 5 en N |

Le choc de confiance générique existant continue de toucher toute l'union.

### Conseil de représailles, automatique au début de N+1

Un tour à part, comme le vote de crise de §7.6 : ouvert par la console au début de N+1, avant les décisions ; seuls les membres restants votent ; majorité des votants ; absent = non. Chaque question est un oui/non :

1. **Tarif sur les importations venant de X** : `tU = sim.retaliationTariff` (10 % par défaut) sur les importations de tous les membres venant de X. Il renchérit les produits de X dans l'union (volume) et rapporte une recette aux importateurs, mais il renchérit aussi la consommation de l'union. Le tarif reste en place jusqu'à ce qu'un conseil ultérieur le lève : l'administrateur peut rouvrir le conseil n'importe quelle année. Cette question câble l'option `allowTariff` aujourd'hui morte.
2. **Règlement immédiat du solde TARGET** (proposé seulement si `T2_X > 0`) : la BCN_X doit payer `T2_X` dans l'année, en réserves `R_X` d'abord ; ce qui manque la force à vendre de la NC contre des euros, donc à déprécier (flottant) ou à épuiser ses réserves (parité). Les réserves de l'union augmentent d'autant.
3. **Vente des titres de X** — possible seulement avec une variante des bilans : à la sortie, la banque centrale de l'union **garde** les titres de X qu'elle détient (`Bcb_X`, désormais en NC) au lieu de les transférer à la BCN_X ; `T2_X` diminue d'autant. Le conseil peut alors décider de les vendre : le marché de X doit les absorber (mécanisme « sans backstop » de §9.7, le taux de X monte), et l'union convertit la NC reçue en euros (sortie de capitaux de X, dépréciation). Sans cette variante, aucun agent de l'union ne détient de titres de X dans le modèle, et la vente n'a pas d'objet.

Le conseil est un lieu de négociation : X peut prendre des engagements (§7.4) avant le vote, par exemple garder une parité ou rembourser le TARGET.

## 12.6 Affichage et plateforme

- **Page étudiants** : option « Leave the union at the end of this year » avec avertissement (irréversible) et confirmation ; après la sortie, levier « Policy rate », choix du régime (`fx`) et de la parité (`peg`), plus de votes du conseil, panneau « Your currency » (`e_X`, taux croisé `e_X·xr`, variations, `T2_X`, réserves `R_X` et alerte en parité, tarif de l'union s'il y en a un). Pour les membres restants : carte de vote du conseil de représailles au début de N+1.
- **Conseil / board** : bandeau « X announced its exit (effective year N+1) » à la publication de N ; résultat du conseil de représailles ; pays sortis grisés dans le panneau de l'union, avec leur change ; majorités sur les membres restants.
- **Console** : le rejeu lit `euro: 'leave'` dans les décisions et construit `opts.exits = {X: N+1}` ; carte « Retaliation council · year N+1 » (Open / Close and announce / Reopen, comme la carte de crise) ; nouvelles lignes de chocs (12.5) ; la console enregistre `state.exits` et `state.retaliation[N]` à la publication.
- **Décomposition** : la sortie, le régime et la parité sont des politiques de X : « own policy » pour X, « foreign » pour les autres ; les mesures de représailles sont des politiques des autres : « foreign » pour X.
- **Page du modèle** : section dépliable « Leaving the union », équations ci-dessus et ordres de grandeur mesurés.
- **Backend** (1.9 ou suivante) : `validateDecision` accepte `rate`, `fx` et `peg` pour un pays présent dans `state.exits` à partir de son année de sortie ; refuse les votes du conseil d'un pays sorti et un second `leave` ; nouveau tour `phase: 'retaliation'` (sur le modèle de `phase: 'crisis'`). Un collage de `Code.gs`.

## 12.7 Moteur et tests

- `params.exit` dans `simulateV11` : aucun pays sorti → chemin actuel inchangé ; v1.1–v2.0 et duel reproduits **au bit près** (tests de régression).
- `dev/engine-test.js`, bloc EXIT : sortie à la référence sans choc → rien ne bouge (`e_X` = 1, `T2_X` = 0) ; identités sur 20 graines × 40 ans : bilan de la BCN_X, identité de l'union avec T2, somme des balances des paiements union + X + RdM = 0, richesse des ménages de X = actifs (en NC), en flottant et en parité ; ordres de grandeur imprimés : baisse de `r_X` d'un point, chocs `exitFlows` −20 et `exitConfidence` −3, tarif de 10 %, règlement du TARGET, dévaluation de 10 % en parité.
- `dev/e2e-exit.js` : annonce en année 2, conseil de représailles et sortie effective en 3, levier `rate`, passage flottant → parité, votes à six, panneau de change, board.

## 12.8 Décisions restantes (recommandation en gras)

1. Vente des titres de X par le conseil : **sans** (bilans validés, `Bcb_X` transféré à la BCN_X) ou avec la variante où la banque centrale de l'union garde `Bcb_X` ?
2. Transmission du change aux importations venant de l'union : **complète** (≈ 3 pts d'inflation pour 10 % de dépréciation) ou réduite ?
3. Tarif de représailles : **10 %**, fixé par l'administrateur, ou montant voté ?
4. Plusieurs sorties dans la même partie : **autorisées** (chaque pays sortant a sa monnaie, toutes contre l'euro) ? Coût de calcul à vérifier au-delà de deux.
5. Réintégration : **non** dans cette version.
