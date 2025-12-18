# Parc matériels GEII — Documentation 🎛️

![Static Badge](https://img.shields.io/badge/Frontend-HTML%2FCSS%2FJS-orange?style=for-the-badge)
![Static Badge](https://img.shields.io/badge/PHP-Backend-blue?style=for-the-badge)
![Static Badge](https://img.shields.io/badge/MySQL-Base-green?style=for-the-badge)

Application web pour réserver, emprunter, rendre et maintenir le parc d’équipements du département GEII. Front en HTML/CSS/JS vanilla, backend PHP (PDO), base MySQL/MariaDB.

<details open>
<summary><strong>🧭 Architecture rapide</strong></summary>

- **Frontend** : `index.html` (auth), `menu.html` (app), `assets/app.js` (logique & rendu), `assets/login.js` (auth), `assets/styles.css` (UI).
- **Backend** : `api/auth.php` (login/register/rôle), `api/equipment.php` (catalogue, réservations, maintenance), `api/dashboard.php` (emprunts, stats, rendus, annulations), `api/reset_state.php` (reset), `api/config.php` (DSN).
- **Données** : `BDD/Projet_BDD.sql` (tables `User`, `Role`, `Materiel`, `Categorie`, `Emprunt`, `Rendu`).

</details>

<details open>
<summary><strong>📌 Règles métier essentielles</strong></summary>

- Pas de réservation dans le passé, durée max 14 jours, dates bloquées si déjà réservées/maintenance.
- Statuts prêt : `En cours`, `Annulation demandee`, `Maintenance`, `Terminé`.
- Etats matériel : `neuf`, `bon`, `passable`, `reparation nécessaire` (on ne peut pas améliorer l’état au retour).
- `Materiel.Dispo` passe à “Non” dès qu’une réservation couvre aujourd’hui ; “Oui” quand plus aucun prêt actif.
- Actions <span style="color:#d9534f;font-weight:600;">admin uniquement</span> : création/suppression matériel, maintenance, rendus, annulations directes, stats globales.

</details>

<details open>
<summary><strong>🔄 Flux principaux</strong></summary>

1) **Auth** (`assets/login.js`) : login/register, mot secret prof, ripple, redirection (`POST /api/auth.php?action=login|register|logout`).
2) **Catalogue** (`assets/app.js`) : recherche + tags, modale calendrier, réservation (`POST /api/equipment.php?action=reserve`), contrôle dates libres et non-passé.
3) **Annulations** : user demande (`POST /api/dashboard.php?action=cancel_request`), admin valide ou supprime (`POST /api/dashboard.php?action=admin_cancel`).
4) **Rendus** (admin) : liste prêts en cours, état borné, rendu (`POST /api/dashboard.php?action=return`), maj dispo + rendu enregistré.
5) **Maintenance** (admin) : planif multi-jours (`POST /api/equipment.php?action=maintenance`), supprime chevauchements, bloque dates.
6) **Stats** : user (`/api/dashboard.php` scope mine) et admin (`/api/dashboard.php?action=admin_stats`), historiques filtrables.

</details>

<details open>
<summary><strong>🧱 Guide de code (survol)</strong></summary>

- **assets/app.js** : état global, appels API (`api*`), rendus (catalogue, prêts user/admin, stats), modale + calendrier (blocage passé, 14j max, dates occupées), normalisation états (`normalizeCondition`, `conditionRank`, `buildBlockedDates`, `isoWeekKey`).
- **assets/login.js** : bascule login/register, bouton œil mdp, `apiLogin`/`apiRegister`.
- **api/auth.php** : sessions, rôles, LastLogin, CRUD users (admin).
- **api/equipment.php** : catalogue + périodes actives, réservations (refus passé/conflits), maintenance (supprime réservations chevauchantes), CRUD matériel (admin).
- **api/dashboard.php** : prêts + historique (garde matériel supprimé), rendus (contrôle état et dispo), annulations user/admin, stats retards/dégradations/maintenances.

</details>

## 🔍 Détail des principales fonctions (logique interne)
- **Frontend (`assets/app.js`)**
  - `renderAdminLoans` : split en deux colonnes (gauche = prêts en cours avec retour/état, droite = annulations à traiter + réservations à venir annulables). Génère dynamiquement les boutons, applique des styles d’alerte sur les demandes, et réactualise les listes après chaque action.
  - `renderCalendar` + `handleDayClick` : construit la grille du mois courant (précalcule les cellules, bloque les dates passées ou réservées, navigation mois ±1). Le clic choisit début/fin, vérifie longueur max (14j) et rejette les plages occupées.
  - `updateAvailabilityMessage` : vérifie plage sélectionnée (non passée, <=14j, libre via `isRangeFree`) et met à jour le bouton/modale avec message ok/erreur.
  - `apiReturnLoan` / `apiAdminCancelLoan` / `apiRequestCancel` : envoient l’action au backend, rafraîchissent ensuite les listes (`apiFetchLoans` + re-render) pour garder l’UI cohérente.
  - `normalizeCondition` / `conditionRank` / `buildReturnOptions` : bornent les états disponibles à la baisse (impossible d’améliorer un état au retour), et formattent les options du select de retour.
  - `buildBlockedDates` / `isRangeFree` : transforment les périodes d’emprunt/maintenance en map de dates bloquées (maintenance prioritaire), utilisées par le calendrier et la validation.
- **Frontend (`assets/login.js`)**
  - `initPasswordToggles` : attache les boutons œil aux champs mdp (aria, type text/password).
  - `switchMode` / `updateSecretVisibility` : alternent login/register et affichent le champ secret pour prof uniquement.
  - `apiLogin` / `apiRegister` : POST JSON vers `api/auth.php`, gèrent les erreurs et déclenchent l’animation ripple avant redirection.
- **Backend Auth (`api/auth.php`)**
  - `login` : récupère user par email ou login, vérifie hash ou mot de passe en clair (dump initial), met à jour `LastLogin`, stocke l’id/role en session.
  - `register` : valide email/mots de passe, rôle professeur protégé par secret côté front, crée l’utilisateur et ouvre la session.
  - `set_role` / `delete_user` : sécurisées admin, empêchent de retirer/supprimer un admin existant par erreur.
- **Backend Catalogue/Reservations (`api/equipment.php`)**
  - `list_equipment` : jointure matériel + catégories, récupère les réservations/maintenances actives et les encode en périodes/semaines pour le front.
  - `reserve_equipment` : refuse identifiant invalide, dates mal formées, période inversée, conflit d’emprunt, et toute date de début passée ; bloque la dispo si la réservation commence maintenant.
  - `set_maintenance` : annule les réservations chevauchantes (hors maintenances existantes), crée une entrée maintenance et met à jour la dispo si période courante.
  - `create_equipment` / `delete_equipment` : CRUD admin, renvoient l’équipement mis à jour pour rafraîchir le front.
- **Backend Emprunts/Stats (`api/dashboard.php`)**
  - `fetch_loans` : renvoie les emprunts (utilisateur ou tous côté admin) en conservant ceux dont le matériel a été supprimé (nom “Matériel supprimé”), calcule la progression et le type.
  - `return_pret` : contrôle droits (admin), empêche le double rendu, borne l’état retourné (pas d’amélioration), met `Materiel.Dispo` à “Oui” si plus d’emprunt actif sur la période, insère le rendu (flag dégradation si état moindre).
  - `request_cancel` : marque un prêt comme “Annulation demandee” après contrôle d’accès et non-rendu.
  - `admin_cancel` : supprime un emprunt non rendu, puis remet la dispo du matériel à “Oui” si aucune autre réservation active ne couvre la date courante.
  - `build_stats` / `build_admin_stats` : calculent retards (dates de fin < aujourd’hui ou rendus tardifs), dégradations (état rendu vs emprunt), maintenances, et fournissent l’historique trié.

## Installation et lancement
1. Cloner puis se placer dans le dossier :
   ```bash
   git clone <repo> && cd BDD_Projet
   ```
2. Créer la base `Projet_BDD` et importer le dump :
   ```bash
   mysql -u <user> -p Projet_BDD < BDD/Projet_BDD.sql
   ```
3. Configurer `api/config.php` ou les variables d’environnement (`DB_DSN`, `DB_USER`, `DB_PASSWORD`).
4. Démarrer un serveur local :
   ```bash
   php -S 127.0.0.1:8000 -t .
   ```
   Ouvrir `http://127.0.0.1:8000/index.html`.
5. Comptes de test (dump) : admin `admin/admin`, user `testtruc/1234`.

## Dépannage
- **401/403** : session expirée ou rôle insuffisant (admin requis). Reconnexion ou vérifier cookies.
- **Conflit de dates** : vérifiez que la plage n’est ni passée ni déjà bloquée et qu’elle dure ≤ 14 jours.
- **Connexion BD** : valider DSN/identifiants dans `api/config.php`, privilégier `127.0.0.1` si le socket est restreint.
- **Reset démo** : `POST /api/reset_state.php` pour vider emprunts/rendus et remettre tout disponible.

## Tests rapides manuels
- Auth : connexion et création d’un compte test.
- Réservation : sélectionner une plage future (<=14j), vérifier grisé des dates passées.
- Annulation : demander une annulation côté user, valider côté admin.
- Retour : marquer un prêt comme rendu en changeant l’état (ne pas pouvoir améliorer l’état initial).
- Maintenance : planifier une maintenance qui chevauche une réservation et vérifier le blocage.
