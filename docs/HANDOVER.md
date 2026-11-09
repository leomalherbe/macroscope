# Macroscope — handover (état au 9 novembre 2026)

Document de reprise : tout ce qu'il faut savoir pour continuer le travail sans l'historique de la conversation. Propriétaire : Léo Malherbe (leo.malherbe@kedgebs.com), KEDGE Business School.

## 1. Ce que c'est

**Macroscope** est un jeu pédagogique multijoueur de politique économique dans une union monétaire (2 à 7 pays parmi DEU, FRA, ITA, ESP, NLD, BEL, AUT), joué par équipes avec un administrateur. Il tourne sur **OPEN-MU**, un modèle stock-flux cohérent (SFC) dérivé de Godley & Lavoie (2007), ch. 6 (économie ouverte, change fixe, réserves) et ch. 12 (flux de capitaux), avec des extensions (firmes et banques horizontalistes, prix dans les échanges, prime de risque, bloc climatique). Les équations sont publiées sur la page du modèle (`macroscope/model.html`). Le jeu a remplacé MacSim 2 le 3/11/2026 après des plantages en séance ; **ne pas mentionner MacSim** dans les supports publics (décision de Léo).

**Licence (décidée par Léo le 8/11, PR #45)** : **CC BY-NC-SA 4.0** pour tout le dépôt (code, modèle, équations, pages, documentation) : citation obligatoire (« Macroscope, by Léo Malherbe »), pas d'usage commercial, versions modifiées sous la même licence. Fichier `LICENSE` à la racine. Vocabulaire : ne pas écrire « open source » (réservé aux licences qui autorisent l'usage commercial), mais « free and open ».

Site : https://leomalherbe.github.io/internationalfinancialmacro/ (cours *International Financial Macroeconomics*, séances 1–7) · page du jeu : `/macroscope/` · desk : `/macroscope/desk.html` (dossier conservé pour les liens déjà distribués) · dépôt : https://github.com/leomalherbe/internationalfinancialmacro

## 2. Architecture

| Pièce | Où | Rôle |
|---|---|---|
| `macroscope/desk.html` | site | page des équipes (PIN) : décisions, votes, résultats, conseil |
| `macroscope/admin.html` | site | console de l'administrateur : classes, groupes, tours, chocs, élections, Run, publication, exports |
| `macroscope/board.html?class=…` | site | tableau de bord à projeter |
| `macroscope/model.html` | site | équations, notation, paramètres, chocs, règles, ordres de grandeur (blocs v1.3 et v2.0 dépliables) |
| `macroscope/accounts.js` | site | les deux matrices (bilan, transactions) de l'union agrégée calculées à partir d'une simulation, pour la page du modèle (carte « The accounts » : version, année de référence ou scénario) ; vérifiées par `engine-test` (lignes et colonnes nulles) |
| `macroscope/index.html` | site | **landing page** publique du jeu (voir §6 bis) ; charge `core.js` et `engine.js` pour sa mini-démo |
| `macroscope/demo.html` | site | partie de démonstration scénarisée (moteur dans le navigateur) |
| `macroscope/engine.js` | site | **le moteur OPEN-MU** (ES5, global `OPENMU`, aussi `module.exports`) ; tourne dans la console et sous Node |
| `macroscope/core.js` | site + backend | règles communes : pays, leviers, indicateurs, état par défaut, validation des décisions, R, classement, élections |
| `macroscope/app-common.js`, `style.css`, `config.js` | site | helpers d'UI, styles, URL du backend (`API_URL`) |
| `macroscope/Code.gs` | Apps Script | backend = `core.js` + `dev/service.js` + `dev/gas-adapter.js`, assemblé par `dev/build.js` |
| Google Sheet de Léo | Google | stockage : onglets Config / Groups / Decisions / Results / Pledges / Comments / Log (append-only, dernière ligne gagne) |

Flux d'un tour : l'administrateur ouvre les soumissions → les équipes soumettent (décisions + votes) → Close → **Run year N** (la console rejoue les années 1..N avec décisions, chocs, votes, élections enregistrés ; le backend ne calcule rien) → aperçu → Save and publish all → les pages se rafraîchissent.

## 3. Versions du modèle (sélection par classe : Control → Parameters → Model version)

| Version | Ajout | Backend requis |
|---|---|---|
| v1.1 | union à 7, réserves 3 mois, firmes/banques, taux contractionnaire, votes (taux ; crise : austérité/dévaluation, **avant** les décisions) | 1.3+ |
| v1.2 | niveau des prix relatif dans les échanges (compétitivité, dévaluation interne), réserves 1,5 mois | — |
| v1.3 | flux de capitaux, régime de change fixe/flottant **par année** (éditeur de chocs), prime de risque (dette > 110 % PIB), chocs sudden stop / taux mondial / backstop, crise de change (vote defend / float) | — |
| v2.0 | émissions, stock mondial, dommage (chômage structurel, inflation sur potentiel abaissé), leviers taxe carbone et investissement vert (60 % importé, rendements décroissants), 6ᵉ dimension « emissions » à poids 0 (activable par élection), ligne « of which the climate » | **1.6+** |
| sortie (§12) | v1.3 et v2.0 avec `sim.exit` : un membre annonce sa sortie (`leave`), sort l'année suivante (monnaie propre flottante ou ancrée, taux directeur, BCN, TARGET), conseil de représailles (tarif, vente des titres, règlement du TARGET ; médiane), chocs administrateur propres ; `OPENMU.simulateExit`, appelé seulement si une sortie est annoncée | **1.9** |
| tarifs (§13) | toutes versions de l'union avec `sim.tariffs` : tarif extérieur commun voté (médiane, 0/5/10/20 %), choc de riposte du RdM, tarif d'un pays sorti sur l'union (0–20 %) ; remplace l'option morte `allowTariff` | **1.10** |
| taille (§14) | union de 2 à 7 membres = les pays des groupes (Save groups, `sim.members`), figée dès que l'année 1 est lancée ; classes antérieures : 7 | — |
| duel | mode arcade : paires de pays identiques, deux monnaies, climat fermé, taux directeur comme levier, chocs asymétriques | **1.8** |

Règles transverses : votes à la **majorité des votants** (PR #25) ; **élections** = changement des poids de R par pays ou pour l'union à partir d'une année (onglet Run, stockées dans `state.shocks['gN'].elections`) ; chocs du warm-up (`'1'…`) et de la partie (`'g1'…`) séparés ; R = score de l'année, classement sur le R cumulé.

Calibration du 7/11 (PR #29, validée par Léo) : pour v1.3+/duel, réserves à 3 mois, avoirs croisés divisés par deux (RdM 15 % du PIB de l'union, bons étrangers ≈ 7 % de la richesse), hausse votée de 0,5 pt → appréciation 3,7 % en flottant — spec §9.8.

## 4. Backend : versions et redéploiement

Le pied de page de la console affiche « backend vX.Y ». Toute modification de `core.js`, `dev/service.js` ou `dev/gas-adapter.js` change `Code.gs` ; un **changement de comportement** exige : Google Sheet → Extensions → Apps Script → remplacer tout `Code.gs` → enregistrer → **Déployer → Gérer les déploiements → ✎ → Nouvelle version → Déployer** (l'URL ne change pas). Un simple re-bundle (core.js modifié pour les pages seulement) ne l'exige pas, mais ne nuit pas. Dernière version : **1.10** (`macroscope/Code.gs`) : droits de douane (§13) ; 1.9 : sortie de l'union (§12). Migration de feuille automatique (colonne `emis`).

## 5. Outils de développement (`dev/` à la racine du dépôt, depuis la PR #29)

- `node dev/build.js` — assemble `macroscope/Code.gs`.
- `node dev/engine-test.js` — moteur : stationnarité (60 ans), identités SFC (20 graines × 40 ans), régressions bit-à-bit entre versions, propriétés (érosion d'une relance, courbe en J, votes, climat, duel), **imprime les ordres de grandeur** utilisés dans les slides et la page du modèle. Doit finir par `ENGINE OK`.
- `node dev/gas-fake-test.js` — backend contre un faux SpreadsheetApp. `GAS adapter OK`.
- `PORT=8794 node dev/mock-server.js &` puis `E2E_PORT=8794 node dev/e2e.js <dir>` (union v1.1, scénario complet), `e2e-v13.js`, `e2e-v20.js`, `e2e-duel.js`, `e2e-exit.js`, `e2e-redirects.js` (anciennes adresses `macsim/`) — Playwright sur les vraies pages ; clé admin `TESTKEY`. Doivent finir par `ALL GOOD`. Playwright doit correspondre au Chromium installé (dans l'environnement du 7/11 : `cd dev && npm i playwright@1.63.0` pour `/opt/pw-browsers/chromium-1243`).
- `node dev/shot-deck.js <deck.html> <dir>` — rend un deck reveal.js et signale les débordements (`OVERFLOW`).
- Dépendances : Node ≥ 18, Playwright (préinstallé dans l'environnement d'origine ; sinon `npm i playwright` + `npx playwright install chromium`), `cd dev && npm install` (reveal.js, chart.js, katex, pdfjs pour le rendu hors ligne).

Discipline : toute modification du moteur passe par les trois niveaux de tests ; les versions antérieures doivent rester identiques au bit près (tests de régression) ; une classe en cours ne doit jamais changer de comportement.

**Cache des pages** : chaque page charge `style.css`, `config.js`, `core.js`, `app-common.js`, `engine.js` (et `accounts.js` pour la page du modèle) avec un suffixe `?v=AAAAMMJJnn` (macroscope/*.html et macroscope/demo.html). **À incrémenter à chaque modification de ces fichiers** (`sed -i 's/?v=OLD/?v=NEW/g' macroscope/*.html macroscope/demo.html`), sinon un navigateur peut associer une page neuve à un script ancien en cache — symptôme vu le 7/11 : board « Connection lost… retrying ». Une erreur d'affichage est désormais signalée comme telle (« Display error: … ») et non comme une perte de connexion.

## 6. Documents

- `docs/openmu-spec.md` — spécification complète, section par version (§1–§11), avec les écarts « as implemented ». À lire avant de toucher au moteur.
- `macroscope/README.md` — guide d'exploitation en français (installation, déroulé d'une séance, chocs, votes, élections, dépannage, versions du backend).
- Slides : `seance6.html` (jeu, v1.1, **figée**, séance passée), `seance7.html` (v1.2 → v1.3, chiffres du moteur). Modèle de deck : reveal.js 5.1, règles éditoriales de Léo : anglais, pas de colonne d'unités, pas de références en bas de diapo, pas de table d'exemple, encadrés de notation, pas de débordement.
- Projet Claude « International Financial Macroeconomics » : copies `claude/openmu-spec.md`, `claude/seance6.html`, `claude/seance7.html`, `claude/coordination.md`.

## 6 bis. Landing page `macroscope/index.html` et charte graphique (8–9/11, PR #39 à #53)

**Public** : enseignants et joueurs en général. Macroscope est **distinct du cours** même si Léo l'utilise en cours : pas de mention des slides ni des séances, ni de MacSim. **Design** : version 7 fournie par Léo (Inter Tight, bleu `#122ddb`, filets, animations : loader, révélations au défilement, curseur, graphique animé) ; ne pas refaire la structure ni les animations sans demande. Ses scripts d'animation sont en JavaScript récent (exception à la règle ES5, voulue par Léo).

Contenu, dans l'ordre : en-tête (« Macroscope » en grand, sous-titre « Learn economic policy by governing an economy. », repères Free / Open / Instant) → boucle en quatre étapes (sans liste détaillée de chocs ni de leviers : plus le modèle est riche, plus il y a de chocs, de leviers et de canaux) + fonction objectif R + graphique animé (chiffres du moteur : v1.2, France, demande publique +7 % trois ans, poids 0,2 ; R = +0,12, +0,03, −0,05) + encadré élections → « A course first, then a game » → critères d'évaluation (diagnostic, effets attendus, cohérence, regard rétrospectif ; pas de critère sur les promesses du conseil, le bluff est permis) → versions (sources Godley & Lavoie ch. 6, 7, 12 et DEFINE simplifié, ajouts maison ; tableau des chocs et décisions par version, chacun dans la version la plus simple où il apparaît) → mini-démo du moteur (présentée comme telle, pas comme le jeu) → séance → bandeau « Arcade mode » pour le duel (le duel n'apparaît que là) → contact. **Pas d'images.** Liens vers la page du modèle en adresse complète (test `e2e-redirects.js` adapté).

**Charte graphique commune (toutes les pages Macroscope, PR #53)** :
- Bleu `#122ddb` (bandeau, titres, filets, boutons), texte et chiffres en marine `#0a1670` sur les pages de jeu (variante « B » choisie par Léo ; la landing garde son texte bleu), atténué `#5566cf`, filets `rgba(18,45,219,.16)`.
- Corail : vif `#ff7a59` pour les traits et repères (soulignés, point du kicker, « vs », trait des critères, badge LIVE, onglet actif) ; **doux `#ffd7cd` (ou `#fff0ea` en fond de carte) sous du texte** (règle de Léo). Vert `#1f8a4c` et rouge `#d8343f` gardent leur sens (aide / pénalise le score ; actions sensibles).
- Polices : Inter Tight (titres, gras, serré), Inter (texte ; chiffres en `tabular-nums` dans les cellules numériques, plus de monospace), STIX Two Text pour les formules (formule de R de la landing, équations de `model.html`).
- Formes : fond blanc, angles droits, pas d'ombre ; cartes blanches avec filet bleu en haut ; en-têtes de tableau soulignés d'un filet bleu.
- Graphiques des scores (« objective, year by year ») : PIB `#122ddb`, chômage `#7f8ff2`, inflation `#ff7a59`, solde public `#ffc2ad`, balance commerciale `#cfd5ea`, émissions `#5aa58c`, ligne R `#0a1670` (dans `app-common.js`) ; la course garde ses sept couleurs de pays.
- Peu d'animation sur les pages de jeu (seuls les survols de boutons) ; l'effet est réservé à la landing.
- Où : section « Macroscope charter » en fin de `style.css` (elle surcharge l'ancien style crème/or/Source Serif conservé au-dessus) ; règles propres en fin du `<style>` de `model.html` ; polices chargées dans l'en-tête de chaque page.

Méthode de travail avec Léo pour le visuel : proposer des captures avant/après (ou un HTML autonome) et n'implémenter qu'après validation ; mise en ligne sur son accord explicite.

## 7. Conventions

- Pages en ES5 (pas de fonctions fléchées ni de template strings dans `macroscope/*.html|js`, sauf les scripts d'animation de la landing) ; styles : **charte Macroscope (§6 bis)** : bleu `#122ddb`, marine `#0a1670`, corail `#ff7a59` / `#ffd7cd`, Inter Tight + Inter + STIX Two Text. Ne plus utiliser la palette du cours (or `#c29d2c`, Source Serif 4) dans les pages Macroscope ; elle reste celle des slides du cours.
- Supports en anglais ; échanges avec Léo en français.
- Git : une branche par sujet, PR vers `main`, description courte avec « redeploy needed » quand c'est le cas ; Léo fusionne lui-même, ou Claude fusionne sur son accord explicite (« ok », « prêt », « mets en ligne »). Commits signés `Claude <noreply@anthropic.com>` avec les lignes d'attribution.
- Depuis le 8/11 le jeu vit dans `macroscope/` (desk = `desk.html`, à côté de la page de présentation `index.html`) ; `macsim/` ne contient plus que des pages de redirection qui gardent `?pin=` / `?class=` et l'ancre, pour les liens et fiches PIN déjà distribués (test : `dev/e2e-redirects.js`). Les clés de stockage du navigateur (`macsim.pin`, `macsim.adminKey`…) et `window.MACSIM_CONFIG` gardent leur nom : les renommer effacerait ce que les navigateurs ont mémorisé. « Macroscope » est le nom du jeu, « OPEN-MU » celui du moteur.

## 8. En suspens / idées

- Licence : décidée (CC BY-NC-SA 4.0, §1) ; reste éventuellement à vérifier avec KEDGE les droits de l'école.
- Contenus pédagogiques par version du modèle (fondements à enseigner avant de jouer), auxquels la landing pourra renvoyer ; mini-démo de la landing à affiner.
- Clés administrateur par classe pour des collègues (v1.9) ou guide « déployez votre copie » ; diffusion (note pédagogique, Zenodo).
- Poids de R « équilibrés » (PIB 0,10 · chômage 0,25 · inflation 0,25 · solde public 0,15 · commerce 0,25) proposés, non tranchés.
- Deck pour la séance « contrainte écologique » (v2.0) et pour le mode duel ; one-pager PDF pour les collègues.
- Résultats : le « R hint » de l'onglet Results utilise les poids de classe (affichage seulement).
