# MacSim 2 · Policy desk — interface de jeu pour la séance 6

Trois pages statiques (à déposer dans le dossier `macsim/` du site GitHub Pages du cours) et un petit
« serveur » Google Apps Script adossé à une Google Sheet, qui garde les décisions, les résultats, les
engagements du conseil des ministres et les commentaires.

| Page | Pour qui | Rôle |
|---|---|---|
| `macsim/index.html` | les groupes (lien ou QR, aucun compte) | se connecter avec le PIN du groupe, soumettre le plan de warm-up (3 ans) ou les décisions de l'année, lire ses résultats, commenter, participer au conseil des ministres |
| `macsim/admin.html` | vous | ouvrir/fermer les tours, publier un communiqué (chocs), **feuilles de saisie dans l'ordre de l'écran MacSim**, saisie des résultats du rapport PDF, classement, conseil, export CSV |
| `macsim/board.html?class=…` | le vidéoprojecteur | état du tour, compte à rebours, communiqué, classement, engagements, « engagements vs décisions » |

Tout est en anglais côté étudiants (langue du cours).

---

## 1. Mise en place (une fois, ~15 minutes)

1. **Créer une Google Sheet vide** (par ex. « MacSim – IFM 2026 ») depuis votre compte Google.
2. Menu **Extensions → Apps Script**. Effacer le contenu de `Code.gs`, **coller le contenu de `macsim/Code.gs`**, enregistrer (icône disquette).
3. Dans la barre d'outils de l'éditeur, choisir la fonction **`setup`** puis **Exécuter**. Google demande d'autoriser le script (compte → « Avancé » → « Accéder à … (non sécurisé) » → Autoriser : c'est votre propre script, l'avertissement est normal). `setup` crée les onglets (Config, Groups, Decisions, Results, Pledges, Comments, Log) et génère la **clé administrateur**, visible dans l'onglet `Config` de la Sheet (et dans le journal d'exécution).
4. **Déployer → Nouveau déploiement** → type **Application Web** → Description libre → *Exécuter en tant que* : **Moi** → *Qui a accès* : **Tout le monde** → **Déployer**. Copier l'**URL de l'application Web** (elle se termine par `/exec`).
5. Dans le site : ouvrir `macsim/config.js` et coller cette URL dans `API_URL`, commit, push. (Tant que `config.js` est vide, les liens « Student page » et les tickets PIN générés par la console contiennent l'URL du script en paramètre `?api=`, donc tout fonctionne aussi sans cette étape.)
6. Ouvrir `https://leomalherbe.github.io/internationalfinancialmacro/macsim/admin.html`, coller l'URL et la clé, **Connect**. Créer la classe (**+ New class**), puis l'onglet **Groups** → **Add 7 default groups** (Allemagne, France, Italie, Pays-Bas, Royaume-Uni, États-Unis, Japon) → **Save groups**. Les PIN à 4 chiffres sont générés ; **Print PIN slips** imprime un ticket par groupe avec le lien.

À tester avant la séance : ouvrir la page étudiants avec un PIN depuis votre téléphone, soumettre un plan, le voir apparaître dans **Entry sheets**.

> Après toute modification de `Code.gs` (nouvelle version de l'interface) : dans l'éditeur Apps Script, remplacer tout le contenu de `Code.gs` par le nouveau fichier, enregistrer, puis **Déployer → Gérer les déploiements → ✎ (modifier) → Version : « Nouvelle version » → Déployer**. L'URL ne change pas, rien à refaire côté site. Modifier les pages HTML ne demande rien de plus qu'un push. La console affiche la version du script dans son pied de page après connexion ; « Unknown action » signale un script pas encore republié.

---

## 2. Déroulé de la séance (checklist)

**Warm-up (chaque groupe gouverne la France 3 ans, les autres pays ne bougent pas)**
1. *Control* : rédiger le communiqué (le choc appliqué, le temps imparti), puis **Open with timer** (10–15 min).
2. Les groupes soumettent leur plan (3 colonnes Année 1/2/3, variations relatives en % bornées à ±10) avec leur stratégie a priori (150 caractères minimum). Ils peuvent modifier jusqu'à la clôture ; seule la dernière soumission compte. Personne ne voit les décisions des autres pendant que le tour est ouvert.
3. **Close submissions**. Onglet *Entry sheets* : une fiche par groupe, leviers dans l'ordre MacSim 1–11, valeurs non nulles en gras, bouton *Copy TSV*, case « entered » pour suivre votre avancement.
4. Pour chaque groupe : revenir à l'année 1 dans MacSim (flèche « Retour »), remettre les décisions à zéro, saisir le plan, **Exécution** trois fois, imprimer les résultats en PDF (un seul fichier : il contient les trois années en colonnes).
5. Onglet *Results* : choisir le groupe dans « This report is the run of », **Import MacSim report (PDF)…** et sélectionner le rapport exporté par MacSim (le gros PDF « Objectifs Principaux … Firmes », pas la feuille des chocs) : les 5 écarts, la valeur de la fonction objectif calculée par MacSim et la décomposition chocs / politique nationale / politiques étrangères sont lus pour la France et placés dans la bonne année ; vérifier, puis **Save and publish all** (ou cocher groupe par groupe). On peut aussi taper les chiffres à la main (R laissé vide = calculé avec les poids des paramètres). Chaque groupe ne voit que ses résultats, avec les lignes « of which », et rédige son analyse a posteriori.
6. Pour le débrief : *Control* → cocher « show every group's warm-up results to everyone » : le tableau comparatif apparaît chez les étudiants et sur le board.

**La partie (un pays par groupe, année par année)**
1. *Control* → **Start the game → year 1** (les soumissions sont fermées). Communiqué (chocs de l'année), **Open submissions** / **Open with timer**.
2. Quand vous le souhaitez : **Convene the council**. Les engagements sont publics (page étudiants + board) ; les décisions restent privées. **Adjourn** quand la négociation est finie.
3. **Close submissions** : dès la clôture, les décisions de tous les pays deviennent visibles (page étudiants + board). *Entry sheets* (une fiche par pays, valeurs à taper dans la case « Variation relative (%) » de chaque cellule) → saisie dans MacSim → simulation de l'année → export du rapport PDF → *Results* → **Import MacSim report (PDF)…** (les 10 pays sont lus, les 7 joués sont remplis) → **Save and publish all** : le classement (sur le R de MacSim) se met à jour.
4. *Control* → cocher **Reveal pledges vs decisions for year N** : le tableau « engagements vs décisions » (✓ kept / ✗ broken) s'affiche partout.
5. **Next year → N+1**, et on recommence. Les étudiants voient leurs résultats et leurs décisions passées, puis justifient l'année suivante.

Le **board** (`Open the board ↗` dans la console) se rafraîchit seul toutes les 15 s ; la page étudiants toutes les 30 s (bouton Refresh aussi).

---

## 3. Paramètres (onglet *Control* → *Parameters*)

| Paramètre | Défaut | Remarque |
|---|---|---|
| Bornes : leviers / tarifs / PGF | ±10 % / ±10 pt / ±10 % | **les 10 leviers sont des variations relatives, en %, de la référence propre au pays** (case « Variation relative (%) » de MacSim) ; **les droits de douane sont des variations absolues en points** (case « Variation absolue ») ; validées côté page et côté serveur |
| Warm-up : pays, années, instruments autorisés, nb max d'instruments, texte min. | France, 3, {emploi public, demande publique, prestations, IR, cotisations employeurs, TVA}, 4, 150 car. | un instrument « utilisé » = non nul sur au moins une année |
| Partie : tarifs / sortie-entrée euro / choc PGF autorisés, nb max d'instruments, texte min., nombre d'années | oui / oui / non, illimité, 100 car., 5 | une décision « tout à zéro » est acceptée dans la partie (ne rien faire est une stratégie : passager clandestin) |
| Visibilité des décisions | masquées tant que le tour est ouvert ; visibles de tous dès que le tour est clos | case « once a round is closed, show everyone's decisions » dans *Control* ; les engagements du conseil sont publics par construction, les justifications restent privées |
| Poids de la fonction objectif | 0,2 partout (vos diapos) | les défauts de MacSim sont 0,15 / 0,10 / 0,25 / 0,25 / 0,25 : mettre ici les mêmes poids que dans le logiciel pour que R colle au rapport |

R = a₁·ΔPIB − a₂·Δchômage − a₃·Δinflation + a₄·Δsolde public + a₅·Δsolde commercial, écarts au compte de référence (Brillet-Cette-Gambini, §I.3). Avec l'import PDF, R est la valeur « Fonction Objectif · Ensemble » du rapport MacSim (les poids de l'interface ne servent qu'en saisie manuelle). Le classement de la partie trie sur le R de la dernière année publiée. Les variables lues dans le rapport : écart relatif du PIB total (%), écart de niveau du taux de chômage (points), écart du taux de croissance des prix de consommation (points), écart du solde public en valeur (points de PIB), écart du solde commercial en valeur (points de PIB).

Ordre des leviers = écran « Décisions Administrateur : Chocs par Pays » de MacSim 2 : 1 emploi des APU · 2 demande globale des APU · 3 cotisations employeurs · 4 cotisations salariés · 5 prestations sociales réelles · 6 IS · 7 IR · 8 subventions · 9 TVA · 10 salaire relatif public/privé · 11 droits de douane par partenaire dans l'ordre BEL, DEU, FRA, GBR, ITA, JPN, LUX, NLD, USA, OEA, ROW ; options : union monétaire, choc de PGF. Les droits de douane se saisissent dans la case « Variation absolue » (points de %), les leviers dans « Variation relative (%) ». L'ordre se change dans `macsim/core.js` (tableau `LEVERS`) et dans `Code.gs` (même tableau).

Plusieurs classes : **+ New class** ; chaque classe a ses groupes, son état et son board (`board.html?class=ID`).

---

## 4. Dépannage

- *Invalid administrator key* : la clé est dans l'onglet `Config` de la Sheet (ligne `adminKey`).
- *Cannot reach the server* chez les étudiants : `API_URL` manquant dans `config.js`, ou déploiement non public (« Qui a accès : Tout le monde »).
- Les pages fonctionnent aussi sans `config.js` renseigné : ajouter `?api=URL_DU_SCRIPT` à l'adresse (utile pour tester avant le push).
- La Sheet est la vérité : tout est append-only (la dernière ligne par groupe/tour l'emporte), l'onglet `Log` trace chaque action. Vous pouvez la consulter pendant la séance sans rien casser ; évitez d'y écrire à la main.
- Un groupe a perdu son PIN : onglet *Groups* de la console.
- Supprimer une classe (par ex. une classe de test) : bouton **Delete class…** dans la barre du haut de la console ; il faut retaper le nom exact de la classe. Ses groupes, PIN, décisions, résultats, engagements et analyses sont retirés de la Sheet (les autres classes ne bougent pas). Irréversible.
- L'import PDF ne remplit rien : vérifier que le fichier est le rapport complet (pages « Objectifs Principaux ») et que l'année du rapport correspond au tour sélectionné ; le message sous le bouton indique les pays/années lus et ignorés. La lecture se fait dans votre navigateur (pdf.js chargé depuis cdnjs) : rien n'est envoyé ailleurs que dans votre Sheet.

---

## 5. Dossier `dev/` (optionnel, pour faire évoluer l'outil)

- `dev/mock-server.js` : réplique locale du backend en mémoire (`node dev/mock-server.js` puis `http://localhost:8787/admin.html`, clé `TESTKEY`).
- `dev/build.js` : régénère `macsim/Code.gs` à partir de `macsim/core.js` + `dev/service.js` + `dev/gas-adapter.js`.
- `dev/e2e.js`, `dev/shot-student.js`, `dev/gas-fake-test.js`, `dev/report-test.js` : scénarios de test (Playwright, y compris l'import du vrai rapport PDF), test de l'adaptateur Sheets, test du parseur de rapport (`npm install pdfjs-dist@3.11.174` dans `devdeps/`).
