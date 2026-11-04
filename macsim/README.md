# OPEN-MU · Policy desk — interface de jeu pour la séance 6

Trois pages statiques (dossier `macsim/` du site GitHub Pages du cours), un petit « serveur » Google Apps Script adossé à une Google Sheet (décisions, résultats, engagements, commentaires), et **le moteur de simulation OPEN-MU** (`macsim/engine.js`, modèle stock-flux d'une union monétaire à N pays, change fixe vis-à-vis du reste du monde) qui tourne dans le navigateur de la console : aucune saisie manuelle, aucun logiciel tiers.

| Page | Pour qui | Rôle |
|---|---|---|
| `macsim/index.html` | les groupes (lien ou QR, aucun compte) | se connecter avec le PIN du groupe, soumettre le plan de warm-up (3 ans) ou les décisions de l'année, lire ses résultats, commenter, participer au conseil des ministres |
| `macsim/admin.html` | vous | ouvrir/fermer les tours, publier un communiqué, **régler les chocs et faire tourner le modèle** (onglet *Run*), publier les résultats, classement, conseil, export CSV |
| `macsim/board.html?class=…` | le vidéoprojecteur | état du tour, compte à rebours, communiqué, **réserves de change de l'union et alerte**, classement, engagements, « engagements vs décisions » |

Tout est en anglais côté étudiants (langue du cours).

---

## 1. Mise en place (une fois, ~15 minutes)

1. **Créer une Google Sheet vide** (par ex. « OPEN-MU – IFM 2026 ») depuis votre compte Google.
2. Menu **Extensions → Apps Script**. Effacer le contenu de `Code.gs`, **coller le contenu de `macsim/Code.gs`**, enregistrer (icône disquette).
3. Dans la barre d'outils de l'éditeur, choisir la fonction **`setup`** puis **Exécuter**. Google demande d'autoriser le script (compte → « Avancé » → « Accéder à … (non sécurisé) » → Autoriser : c'est votre propre script, l'avertissement est normal). `setup` crée les onglets (Config, Groups, Decisions, Results, Pledges, Comments, Log) et génère la **clé administrateur**, visible dans l'onglet `Config` de la Sheet (et dans le journal d'exécution).
4. **Déployer → Nouveau déploiement** → type **Application Web** → Description libre → *Exécuter en tant que* : **Moi** → *Qui a accès* : **Tout le monde** → **Déployer**. Copier l'**URL de l'application Web** (elle se termine par `/exec`).
5. Dans le site : ouvrir `macsim/config.js` et coller cette URL dans `API_URL`, commit, push. (Tant que `config.js` est vide, les liens « Student page » et les tickets PIN générés par la console contiennent l'URL du script en paramètre `?api=`, donc tout fonctionne aussi sans cette étape.)
6. Ouvrir `https://leomalherbe.github.io/internationalfinancialmacro/macsim/admin.html`, coller l'URL et la clé, **Connect**. Créer la classe (**+ New class**), puis l'onglet **Groups** → **Add 7 default groups** (Allemagne, France, Italie, Espagne, Pays-Bas, Belgique, Autriche — les membres de l'union du modèle) → **Save groups**. Les PIN à 4 chiffres sont générés ; **Print PIN slips** imprime un ticket par groupe avec le lien.

À tester avant la séance : ouvrir la page étudiants avec un PIN depuis votre téléphone, soumettre un plan, le voir en vert dans l'onglet **Run**, cliquer **Run all submitted plans** puis **Save and publish all**, et voir les résultats arriver sur le téléphone.

> Après toute modification de `Code.gs` (nouvelle version de l'interface) : dans l'éditeur Apps Script, remplacer tout le contenu de `Code.gs` par le nouveau fichier, enregistrer, puis **Déployer → Gérer les déploiements → ✎ (modifier) → Version : « Nouvelle version » → Déployer**. L'URL ne change pas, rien à refaire côté site. Modifier les pages HTML ne demande rien de plus qu'un push. La console affiche la version du script dans son pied de page après connexion (**v1.3** pour OPEN-MU avec les votes ; v1.2 = chocs et lignes « union », sans les votes) ; « Unknown action » ou des chocs qui ne s'enregistrent pas signalent un script pas encore republié.

---

## 2. Déroulé de la séance (checklist)

**Warm-up (chaque groupe gouverne la France 3 ans, les autres membres ne bougent pas)**
1. *Run* : régler les **chocs** des années 1 à 3 (demande mondiale, taux de la banque centrale, confiance des ménages, propension à importer, dévaluation ; 0 = pas de choc) → **Save shocks**. Les mêmes chocs s'appliquent à tous les groupes.
2. *Control* : rédiger le communiqué (le choc, le temps imparti), puis **Open with timer** (10–15 min).
3. Les groupes soumettent leur plan (3 colonnes Année 1/2/3, variations relatives en % de la référence bornées à ±10, 4 leviers : demande publique, prestations, impôt sur le revenu, TVA) avec leur stratégie a priori (150 caractères minimum). Ils peuvent modifier jusqu'à la clôture ; seule la dernière soumission compte. Personne ne voit les décisions des autres pendant que le tour est ouvert.
4. **Close submissions**, puis *Run* → **▶ Run all submitted plans** : chaque plan est simulé seul (la France suit le plan du groupe, les autres membres restent à leur politique de référence). L'aperçu montre les 5 écarts, R et la décomposition propre / étranger / chocs ; **Save and publish all** (ou **Save as draft** pour relire d'abord dans *Results*). Chaque groupe voit alors ses trois années avec les lignes « of which », l'état de l'union (réserves, solde courant, change) et rédige son analyse a posteriori.
5. Pour le débrief : *Control* → cocher « show every group's warm-up results and plans to everyone » : le tableau comparatif apparaît chez les étudiants et sur le board.

**La partie (un pays par groupe, année par année)**
1. *Control* → **Start the game → year 1** (les soumissions sont fermées). *Run* : chocs de l'année 1 → **Save shocks**. Communiqué, puis **Open submissions** / **Open with timer**.
2. Quand vous le souhaitez : **Convene the council**. Les engagements sont publics (page étudiants + board) ; les décisions restent privées. **Adjourn** quand la négociation est finie.
3. **Close submissions** : dès la clôture, les décisions et les votes de tous les pays deviennent visibles (page étudiants + board). *Run* → **▶ Run year N** (refusé tant que le tour est ouvert) : le modèle rejoue les années 1 à N à partir des décisions enregistrées, des chocs et des votes (un pays sans décision garde sa politique de référence et vote hold / austerity) → aperçu, avec le dépouillement des votes et leur effet → **Save and publish all** : le classement et le panneau de l'union se mettent à jour.
4. *Control* → cocher **Reveal pledges vs decisions for year N** : le tableau « engagements vs décisions » (✓ kept / ✗ broken) s'affiche partout.
5. **Next year → N+1**, et on recommence. Les étudiants voient leurs résultats et leurs décisions passées, puis justifient l'année suivante.

**Votes (partie seulement).** Avec ses décisions annuelles, chaque pays vote ; un pays = une voix ; il faut une majorité des pays qui jouent (strictement plus de la moitié des groupes ayant un pays ; un groupe qui ne soumet pas vote « hold » et « austerity »). Les votes restent secrets tant que le tour est ouvert et sont révélés avec les décisions à la clôture.
- **Taux de la banque centrale** (à chaque tour) : *cut / hold / hike*. Une majorité de cut baisse le taux de 0,5 point, une majorité de hike le monte de 0,5 point ; **le changement est permanent** (il se cumule d'un tour à l'autre, jusqu'au vote suivant) et s'ajoute au choc de taux de l'administrateur de l'année ; le taux reste entre 0 et 10 %. Le taux agit sur l'investissement l'année suivante et sur le service de la dette de tous les budgets tout de suite.
- **Crise de réserves** (seulement si les réserves de l'union ont fini l'année précédente sous la ligne d'alerte, 25 % du stock initial) : *austerity / devaluation*. Une majorité de devaluation → le change saute de 10 % cette année-là ; sinon, programme d'austérité : la demande publique et les prestations de **chaque** membre sont plafonnées à −5 % de la référence pour l'année (une soumission plus basse est conservée ; l'aperçu liste les pays plafonnés). Réserves épuisées (R ≤ 0 à la fin de l'année précédente) → **dévaluation forcée de 15 %**, sans vote. La question de crise n'apparaît sur la page étudiants que lorsque le dernier panneau de l'union publié porte l'étiquette ALERT ; d'où l'importance de **publier** chaque année avant d'ouvrir la suivante.
L'aperçu de *Run* et le panneau de l'union (console, page étudiants, board) affichent le dépouillement (x cut · y hold · z hike → ±0,5 pt · taux effectif ; x austerity · y devaluation → résultat ; pays plafonnés).

**Réserves et dévaluation.** Le change est fixe : la banque centrale commune couvre le déficit courant de l'union avec ses réserves (3 mois d'importations au départ). Le panneau de l'union (console, page étudiants, board) montre les réserves en mois d'importations et en % du stock initial ; sous **25 %**, l'étiquette **ALERT** apparaît et le tour suivant porte le vote austérité / dévaluation. Vous pouvez aussi décréter une **dévaluation** vous-même : *Run* → champ « Devaluation » de l'année (par ex. 10 = le change saute de 10 %) → **Save shocks** → annoncer dans le communiqué (elle s'ajoute à une éventuelle dévaluation votée). Effets : les importations renchérissent tout de suite (inflation importée), les exportations repartent avec un an de retard (courbe en J).

Le **board** (`Open the board ↗` dans la console) se rafraîchit seul toutes les 15 s ; la page étudiants toutes les 30 s (bouton Refresh aussi).

---

## 3. Paramètres (onglet *Control* → *Parameters*)

| Paramètre | Défaut | Remarque |
|---|---|---|
| Bornes : leviers | ±10 % | **les 4 leviers sont des variations relatives, en %, de la référence propre au pays** (0 = pas de changement) ; validées côté page et côté serveur. Tarifs, euro et PGF : hors OPEN-MU v1, laissés désactivés |
| Warm-up : pays, années, instruments autorisés, nb max d'instruments, texte min. | France, 3, les 4 leviers, 4, 150 car. | un instrument « utilisé » = non nul sur au moins une année |
| Partie : nb max d'instruments, texte min., nombre d'années | illimité, 100 car., 5 | une décision « tout à zéro » est acceptée dans la partie (ne rien faire est une stratégie : passager clandestin) |
| Visibilité des décisions | masquées tant que le tour est ouvert ; visibles de tous dès que le tour est clos | case « once a round is closed, show everyone's decisions » dans *Control* ; les engagements du conseil sont publics par construction, les justifications restent privées |
| Poids de la fonction objectif | 0,2 partout (vos diapos) | R = Σ poids × écart, signes négatifs sur le chômage et l'inflation ; calculé par la console à partir des 5 écarts du modèle |
| Votes | activés ; pas de 0,5 pt ; plafond d'austérité −5 % ; dévaluation votée 10 % ; dévaluation forcée 15 % | case « votes enabled » pour jouer sans les votes ; enregistrés dans `state.sim` |
| Chocs (onglet *Run*) | 0 | demande mondiale (%), taux de la banque centrale (points), confiance des ménages (%), propension à importer (%), dévaluation (%) ; enregistrés par année dans l'état de la classe |

R = a₁·ΔPIB − a₂·Δchômage − a₃·Δinflation + a₄·Δsolde public + a₅·Δsolde commercial, écarts à l'état stationnaire de référence du modèle : PIB en %, chômage et inflation en points (thermomètres d'Okun et de Phillips posés sur le modèle), soldes public et commercial en points de PIB. R est le **score de l'année** (écarts de l'année, pondérés), pas une variation d'une année sur l'autre ; le **R cumulé** est la somme des scores annuels (colonne « Cumulative R » / « Cum. R » partout, avec la même décomposition propre / étranger / chocs). Le classement de la partie et le débrief du warm-up trient sur le R cumulé. La décomposition « propre / étranger / chocs » est obtenue par simulations contrefactuelles (chocs seuls ; chocs + politique du pays seul ; tout).

Les 4 leviers (`macsim/core.js`, tableau `LEVERS`, repris dans `Code.gs`) : demande publique G, prestations TR, taux d'impôt sur le revenu θ, taxe sur la consommation τ. Le modèle et son calibrage sont décrits dans `docs/openmu-spec.md`.

Plusieurs classes : **+ New class** ; chaque classe a ses groupes, son état et son board (`board.html?class=ID`).

---

## 4. Dépannage

- *Invalid administrator key* : la clé est dans l'onglet `Config` de la Sheet (ligne `adminKey`).
- *Cannot reach the server* chez les étudiants : `API_URL` manquant dans `config.js`, ou déploiement non public (« Qui a accès : Tout le monde »).
- Les pages fonctionnent aussi sans `config.js` renseigné : ajouter `?api=URL_DU_SCRIPT` à l'adresse (utile pour tester avant le push).
- La Sheet est la vérité : tout est append-only (la dernière ligne par groupe/tour l'emporte), l'onglet `Log` trace chaque action. Vous pouvez la consulter pendant la séance sans rien casser ; évitez d'y écrire à la main.
- Un groupe a perdu son PIN : onglet *Groups* de la console.
- Supprimer une classe (par ex. une classe de test) : bouton **Delete class…** dans la barre du haut de la console ; il faut retaper le nom exact de la classe. Ses groupes, PIN, décisions, résultats, engagements et analyses sont retirés de la Sheet (les autres classes ne bougent pas). Irréversible.
- « engine not loaded » dans l'onglet *Run* : `macsim/engine.js` manque sur le site ou n'a pas chargé ; recharger la page. Les résultats restent saisissables à la main dans *Results*.
- « Close the round first » : le bouton Run year refuse de tourner tant que les soumissions sont ouvertes (*Control* → **Close submissions**).
- Les chocs ne s'enregistrent pas, ou les votes sont refusés / absents des décisions : le script Apps Script n'est pas en v1.3 (voir le pied de page de la console) ; recoller `Code.gs` et republier une version.
- La question « austerity or devaluation » n'apparaît pas chez les étudiants alors que l'union est en alerte : l'année précédente n'a pas été **publiée** (Save and publish all), ou la page n'a pas été rafraîchie.

---

## 5. Dossier `dev/` (optionnel, pour faire évoluer l'outil)

- `dev/mock-server.js` : réplique locale du backend en mémoire (`node dev/mock-server.js` puis `http://localhost:8787/admin.html`, clé `TESTKEY`).
- `dev/build.js` : régénère `macsim/Code.gs` à partir de `macsim/core.js` + `dev/service.js` + `dev/gas-adapter.js`.
- `dev/e2e.js`, `dev/shot-student.js`, `dev/gas-fake-test.js` : scénarios de test (Playwright : warm-up, Run, partie, conseil, board, suppression de classe), test de l'adaptateur Sheets. `dev/engine-stub.js` : simulacre du moteur servi par le mock quand `macsim/engine.js` est absent. `dev/engine-test.js` : tests du moteur (état stationnaire, identités comptables, multiplicateurs).
- `dev/report-test.js` et `macsim/report.js` : lecteur des rapports PDF de MacSim 2, conservé mais plus utilisé.
