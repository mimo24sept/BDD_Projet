# Parc matériels GEII — Documentation

Application web pour réserver, emprunter, rendre et maintenir le parc d’équipements du département GEII. Front en HTML/CSS/JS vanilla, backend PHP (PDO) et base MySQL/MariaDB.

## Architecture rapide
- **Frontend** : `index.html` (auth), `menu.html` (app), `assets/app.js` (logique, rendu, état global), `assets/login.js` (auth), `assets/styles.css` (UI).
- **Backend** : `api/auth.php` (login/register/rôle), `api/equipment.php` (catalogue, réservations, maintenance), `api/dashboard.php` (emprunts, stats, rendus, annulations), `api/reset_state.php` (remise à zéro), `api/config.php` (DSN).
- **Données** : schéma SQL dans `BDD/Projet_BDD.sql`, tables clés `User`, `Role`, `Materiel`, `Categorie`, `Emprunt`, `Rendu`.

## Règles métier essentielles
- Réservation impossible dans le passé, durée max 14 jours, blocage des dates déjà réservées/maintenance.
- Statuts d’emprunt : `En cours`, `Annulation demandee`, `Maintenance`, `Terminé`.
- Etats matériel autorisés : `neuf`, `bon`, `passable`, `reparation nécessaire` (un retour ne peut pas améliorer l’état initial).
- Disponibilité (`Materiel.Dispo`) mise à jour dès qu’une réservation couvre la date du jour.
- Admin seul autorisé pour : création/suppression matériel, maintenance, rendus, annulations directes, stats globales.

## Flux principaux (fonctionnement)
1. **Auth (`assets/login.js`)** : formulaire login/register, bascule rôle professeur par mot secret, ripple puis redirection vers `menu.html`. API : `POST /api/auth.php?action=login|register|logout`.
2. **Catalogue (`assets/app.js`)** : recherche + tags, ouverture d’une modale avec calendrier. Réservation via `POST /api/equipment.php?action=reserve` (vérif dates libres, non passé).
3. **Annulations** : utilisateur peut demander l’annulation d’un prêt futur (`POST /api/dashboard.php?action=cancel_request`). Admin peut valider/annuler directement (`POST /api/dashboard.php?action=admin_cancel`).
4. **Rendus (admin)** : liste des prêts en cours, sélection d’état bornée, enregistrement via `POST /api/dashboard.php?action=return` (met à jour `Materiel` et insère un `Rendu`).
5. **Maintenance (admin)** : planification multi-jours (`POST /api/equipment.php?action=maintenance`), supprime les réservations chevauchantes et bloque les dates.
6. **Stats** : côté user (`/api/dashboard.php` scope mine) et côté admin (`/api/dashboard.php?action=admin_stats`), historiques filtrables.

## Guide de code (points importants)
- **assets/app.js**
  - Etat global `state` (user, inventaire, prêts, filtres, stats).
  - Fonctions `api*` : wrappers fetch pour auth, catalogue, prêts, stats.
  - Rendus : `renderCatalog`, `renderLoans`, `renderAdminLoans` (deux colonnes : en cours vs annulations/réservations à venir), `renderStats`/`renderAdminStats`.
  - Modale + calendrier : `openModal`, `renderCalendar`, `handleDayClick`, `updateAvailabilityMessage` (bloque passé, >14j, dates occupées).
  - Normalisation : `normalizeCondition`, `conditionRank`, `buildBlockedDates`, `isoWeekKey`.
- **assets/login.js**
  - Bascule login/register, boutons œil pour les mots de passe, appels API `apiLogin`/`apiRegister`.
- **api/auth.php**
  - `login`/`register` (sessions PHP, lookup rôle, colonne `LastLogin`), `list_users` (admin), `set_role`, `delete_user`.
  - `is_valid_password` accepte hash ou mot de passe en clair du dump initial.
- **api/equipment.php**
  - `list_equipment` renvoie catalogue + réservations actives.
  - `reserve_equipment` vérifie dates, conflits, et refuse le passé.
  - `set_maintenance` annule les réservations chevauchantes et bloque les dates.
  - `create_equipment`/`delete_equipment` protégés admin.
- **api/dashboard.php**
  - `fetch_loans` renvoie prêts + historique (garde ceux dont le matériel a été supprimé).
  - `return_pret` contrôle accès, enregistre rendu, remet dispo si plus d’emprunt actif.
  - `request_cancel` (demande user) vs `admin_cancel` (suppression admin).
  - `build_stats`/`build_admin_stats` calculent retards, dégradations, maintenances.

## Détail des principales fonctions (logique interne)
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
