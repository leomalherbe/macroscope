# §12 (proposition, 07/11) — Sortie de l'union monétaire

Statut : **proposition à valider par Léo**, rien n'est codé. Les ordres de grandeur marqués « cible » sont à mesurer avec `dev/engine-test.js` une fois le moteur écrit ; ceux marqués « mesuré » viennent de l'état de référence actuel (v2.0).

## 12.0 État actuel

Le champ `euro: 'none'|'leave'|'join'` existe dans les décisions (`core.js`, hérité de MacSim), la case `game.allowEuro` aussi (Control → Parameters), le formulaire étudiant l'affiche et le backend le valide. **Le moteur ne le lit pas** : une équipe qui « sort » reste dans l'union. À ne pas activer en séance avant cette version.

## 12.1 Objectif pédagogique

Montrer ce qu'une sortie rend (un taux et un change à soi, la dévaluation externe au lieu de la dévaluation interne) et ce qu'elle coûte (fuite des capitaux à l'annonce, inflation importée, dette en monnaie étrangère, solde TARGET, perte de la part des réserves communes), et ce qu'elle impose aux autres (commerce, réserves, votes). Ni repas gratuit ni suicide : une option qui se discute au conseil.

## 12.2 Règle de jeu

- **Qui décide** : l'équipe, seule (pas de vote du conseil — il n'existe pas de clause de sortie de l'euro ; l'annonce unilatérale est le cas d'école). Option `sim.exitVote` pour exiger un accord du conseil, désactivée par défaut.
- **Calendrier** : choix `leave` avec les décisions de l'année N (secret tant que le tour est ouvert, révélé à la publication comme les votes). L'année N est **l'année de l'annonce** (le pays est encore membre, la fuite des capitaux joue). La sortie est **effective au 1er janvier de N+1** : nouvelle monnaie, banque centrale nationale.
- **Irréversible** dans la partie (pas de `join`).
- **Après la sortie**, le pays : ne vote plus au conseil (taux, crise de réserves, crise de change) — les majorités se comptent sur les membres restants ; obtient le levier `rate` du mode duel (points autour de r*, ±2, pas 0,25) ; garde les six autres leviers ; reste classé avec le même R.
- **Disponibilité** : classes v1.3 et v2.0 seulement (il faut le compte financier et le change flottant de §9). Pas en v1.1/v1.2, pas en duel. Activation par classe : `sim.exit = true` (Control → Parameters), qui remplace `game.allowEuro`.

## 12.3 Bilans au moment de la sortie (début de N+1)

Notation : X le pays sortant, NC sa nouvelle monnaie, `e_X` = prix d'un euro en NC (`e_X` ↑ = dépréciation de la NC), `e_X = 1` à la sortie. Taux croisé avec le reste du monde : `e_X · xr`.

**Redénomination 1 pour 1 de tout ce qui relève du droit national** : billets `H_X`, dépôts `M_X`, prêts `L_X`, titres publics détenus par les ménages `Bh_X` et les banques `Bb_X`, avances `A_X`, titres détenus par la banque centrale `Bcb_X`. Aucun effet de richesse à la sortie.

**Ce qui reste en monnaie étrangère** :
- `Bw_X` : titres publics de X détenus par le reste du monde → **restent en euros** (droit étranger) ; valeur en NC `e_X · Bw_X`. C'est le « péché originel » : une dépréciation alourdit la dette publique en NC, donc le ratio dette/PIB, donc la prime de risque de §9.6.
- `Bf_X` : titres étrangers des ménages → restent en monnaie mondiale ; valeur `e_X · xr · Bf_X`. Une dépréciation enrichit les ménages.
- Mesuré à la référence : `Bw_X` = 15 % du PIB, `Bf_X` = 15 % du PIB. La position extérieure nette de X est donc nulle au départ, et une dépréciation est **neutre pour le pays mais redistributive** : l'État perd, les ménages gagnent. Une dépréciation de 20 % ajoute ≈ 3 points de PIB à la dette publique.

**Banque centrale nationale (BCN_X)** : reprend `H_X` au passif, `Bcb_X` et `A_X` à l'actif, plus une **part des réserves communes** `R_X = R · Y*_X / ΣY*` (clé de capital = taille de référence). Le solde de son bilan est un **solde TARGET** envers la banque centrale de l'union, en euros :

```
T2_X = H_X − Bcb_X − A_X − xr · R_X          (en euros, à la date de sortie ; > 0 : BCN_X doit à l'union)
```

Mesuré : à la référence `H − Bcb − A` = 3,7 % du PIB pour chaque membre, et la part des réserves par la taille = 3,75 % → **T2 ≈ 0 à la référence**. Il devient non nul quand X a creusé (ou financé) le déficit extérieur de l'union pendant la partie : un pays qui a « consommé » les réserves communes sort avec une dette TARGET. Proposition : `T2_X` est un stock en euros, constant, rémunéré au taux de l'union `r`, jamais remboursé dans la partie (option `sim.exitT2 = 'carry' | 'cancel'`).

**Union** : `R` diminue de `R_X` ; la banque centrale de l'union porte `T2_X` en créance (ou dette) sur BCN_X. Identité de l'union (sans X) : `Σ_{i≠X} H_i = Σ_{i≠X} (Bcb_i + A_i) + xr · R + T2_X − NWcb`.

## 12.4 Équations de X après la sortie

Mêmes équations qu'un membre de v1.3/v2.0, avec :

**Taux** : `r_X = r* + rate_X/100` (levier), plus la prime `s_X` de §9.6 calculée sur la dette totale en NC `(B_X)/Y_X` où `B_X` inclut `e_X · Bw_X`. Investissement : `invF_X = 1 − ι·(r_X,−1 − r*)` comme aujourd'hui. Le choc de taux de l'administrateur et le vote de la BCE ne touchent plus X.

**Commerce** — même convention que pour le reste du monde aujourd'hui (prix en monnaie du producteur, effets prix avec un an de retard, élasticités inchangées) :
```
importations de X depuis j ∈ union :  volume IMU_Xj = (1 − sR)·μ·Y_X · s_Xj · (e_X,−1 · Prel_j,−1 / Prel_X,−1)^(−εU)      coût en NC : e_X · IMU_Xj
importations de j depuis X :          volume IMU_jX = (1 − sR)·μ·Y_j · s_jX · (Prel_X,−1 / (e_X,−1 · Prel_j,−1))^(−εU)    coût en euros : IMU_jX / e_X
importations de X depuis le RdM :     IMR_X = sR·μ·Y_X · (e_X,−1·xr_−1 / (xr0·Prel_X,−1))^(−ε)                         coût en NC : e_X·xr·IMR_X
exportations de X vers le RdM :       XR_X = xR*_X · monde · (e_X·xr / (xr0·Prel_X,−1))^η
```

**Inflation** (thermomètre) : la transmission du change vaut désormais pour toutes les importations de X, au même degré par unité de part importée qu'aujourd'hui :
```
π_X = … + ω · 100·Δ(e_X·xr)/(e_X·xr)_−1 + ω·((1 − sR)/sR) · 100·Δe_X/e_X,−1
```
Avec sR = 0,5 (mesuré), une dépréciation de 10 % de la NC contre l'euro ajoute ≈ 3 points d'inflation l'année même (ω = 0,15 sur chaque moitié). C'est le principal coût pour R ; à confirmer avec Léo (on peut réduire le second terme).

**Portefeuilles** : ménages de X : `λF = λF0 + λf1·(r_w − r_X − s_X)` (anticipations statiques, comme ch. 12) ; pas de détention de titres de l'union (le modèle n'en a pas aujourd'hui entre membres). Reste du monde : demande de titres de X `Bw$_X = Bw$*_X · (1 + χw·(r_X − r_w) − χs·s_X) · (1 + flows/100) · (1 − fuite_X)`, libellés en euros (12.3).

**Balance des paiements de X** (en NC) :
```
CA'_X = (X_X − e_X·IMU_X − e_X·xr·IMR_X) + r_w,−1·e_X·xr·Bf_X,−1 − (r_−1 + s_X,−1)·e_X·Bw_X,−1 − r_−1·e_X·T2_X
KA_X  = e_X·ΔBw_X − e_X·xr·ΔBf_X
flottant (défaut) :  e_X résout CA'_X + KA_X = 0 ;   réserves R_X gelées
fixe (variante)   :  e_X donné (parité 1, dévaluations décrétées), R_X = R_X,−1 + (CA'_X + KA_X)/(e_X·xr) ; épuisement → dévaluation forcée de 15 % comme en duel
```
Régime de X : nouvelle ligne de l'éditeur de chocs « Exit regime » (float/fixed) par année, comme `regime` pour l'union.

**Union** : ses échanges avec X deviennent extérieurs. Son compte courant `CA'` inclut le solde avec X (exportations vers X en euros, importations depuis X à `1/e_X`) et les intérêts reçus sur `T2_X` ; en fixe, `R` absorbe tout le solde extérieur de l'union (RdM et X) ; en flottant, `xr` le solde. Les agrégats de l'union (PIB, niveau des prix, alerte, mois d'importations) excluent X à partir de N+1.

**Résolution** : si X et l'union flottent tous deux, deux taux à résoudre conjointement (`xr`, `e_X`) : boucle externe sur `xr` (encadrement + sécante, comme aujourd'hui), boucle interne sur `e_X`. Coût ≈ 10 × 10 évaluations du point fixe annuel, dans le budget de la console (à vérifier).

## 12.5 Coûts de transition (chocs automatiques, paramétrables)

| Année | Mécanisme | Paramètre (défaut proposé, à calibrer) |
|---|---|---|
| N (annonce, X encore membre) | **Fuite des dépôts** : les ménages de X sortent des actifs en euros redénominables vers les titres étrangers, `λF0_X += exitRun` | `sim.exitRun` = 5 points de richesse |
| N | Le RdM vend les titres de X | `sim.exitFlight` = 20 % de `Bw$_X` |
| N+1 | Confiance des ménages de X, `α1 × (1 − exitConf)` | `sim.exitConf` = 2 % |
| N+1, N+2 | La fuite du RdM persiste puis s'efface de moitié par an | — |

La fuite de l'année N passe par les **réserves communes** si l'union est en change fixe : les autres membres paient l'annonce de X. C'est l'externalité à faire voir au conseil (et un argument pour la variante `sim.exitVote`).

Cibles (non mesurées) pour la France, flottant, sans réaction de politique : dépréciation de la NC 10–20 % en N+1 ; inflation +2 à +4 pts en N+1 ; PIB −1 à −2 % en N+1 (courbe en J, confiance), puis au-dessus de la référence à partir de N+2 ou N+3 si le change reste déprécié ; dette publique +2 à +4 pts de PIB par la valorisation de `Bw_X` ; réserves de l'union −10 à −25 % de R0 en N avec l'union en fixe.

## 12.6 Affichage et plateforme

- **Page étudiants** : option « Leave the union at the end of this year » avec avertissement (irréversible, coûts de l'année d'annonce) et confirmation ; après la sortie, levier « Policy rate », plus de votes du conseil, panneau « Your currency » (e_X, variation, T2, dette en euros en % du PIB, réserves si parité).
- **Conseil / board** : bandeau « X announced its exit (effective year N+1) » à la publication de N ; pays sortis grisés dans le panneau de l'union, avec leur change ; majorités sur les membres restants.
- **Console** : le rejeu lit `euro: 'leave'` dans les décisions et construit `opts.exits = {X: N+1}` ; l'aperçu du Run signale l'annonce ; la console enregistre `state.exits` à la publication (le backend en a besoin pour valider `rate`).
- **Décomposition** : la sortie est une politique de X : dans « own policy » pour X, dans « foreign » pour les autres.
- **Page du modèle** : section dépliable « Leaving the union », équations ci-dessus et ordres de grandeur mesurés.
- **Backend** (1.9 ou suivante) : `validateDecision` accepte `rate` pour un pays présent dans `state.exits` à partir de son année de sortie, refuse les votes du conseil d'un pays sorti, refuse un second `leave`. Un collage de `Code.gs`.

## 12.7 Moteur et tests

- `params.exit` dans `simulateV11` : aucun pays sorti → chemin actuel inchangé ; v1.1–v2.0 et duel reproduits **au bit près** (tests de régression).
- `dev/engine-test.js`, bloc EXIT : sortie à la référence sans coûts de transition → rien ne bouge (`e_X` = 1, T2 = 0) ; identités sur 20 graines × 40 ans : bilan de BCN_X, identité de l'union avec T2, somme des balances des paiements union + X + RdM = 0, richesse des ménages de X = actifs (en NC) ; ordres de grandeur imprimés (12.5).
- `dev/e2e-exit.js` : annonce en année 2, sortie effective en 3, levier `rate`, votes à six, panneau de change, board.

## 12.8 Décisions à prendre (recommandation en gras)

1. Sortie **unilatérale** ou soumise au conseil ?
2. Régime de X après la sortie : **flottant** (parité en variante par l'éditeur de chocs) ?
3. Dette détenue par le RdM : **reste en euros** ou redénominée (défaut partiel : la prime et la fuite du RdM bondissent) ?
4. Solde TARGET : **porté en euros, rémunéré** ou annulé ?
5. Coûts de transition : **activés**, avec les trois paramètres de 12.5 réglables par classe ?
6. Transmission du change aux importations venant de l'union : **complète** (≈ 3 pts d'inflation pour 10 %) ou réduite ?
7. Plusieurs sorties dans la même partie : **autorisées** (chaque pays sortant a sa monnaie, toutes contre l'euro) ? Coût de calcul à vérifier au-delà de deux.
8. Réintégration : **non** dans cette version.
