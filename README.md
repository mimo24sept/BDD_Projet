# Parc matériels GEII — Documentation

![Static Badge](https://img.shields.io/badge/Frontend-HTML%2FCSS%2FJS-orange?style=for-the-badge)
![Static Badge](https://img.shields.io/badge/PHP-Backend-blue?style=for-the-badge)
![Static Badge](https://img.shields.io/badge/MySQL-Base-green?style=for-the-badge)

Application web pour réserver, emprunter, rendre et maintenir le parc d’équipements du département GEII. Front en HTML/CSS/JS vanilla, backend PHP , base MySQL.

<details open>
<summary><strong>🧭 Architecture rapide</strong></summary>

- **Frontend** : `index.html` (auth), `menu.html` (app), `assets/app.js` (boot + events), `assets/app/` (`api.js`, `render.js`, `calendar.js`, `ui.js`, `utils.js`, `state.js`, `dom.js`, `permissions.js`, `config.js`), `assets/login.js` (auth), `assets/styles/base.css` + `assets/styles/auth.css` + `assets/styles/app.css` (UI).
- **Backend** : `api/auth.php` (login/register/rôle), `api/equipment.php` (catalogue, réservations, maintenance), `api/dashboard.php` (emprunts, stats, rendus, annulations/prolongations), `api/reset_state.php` (reset), `api/config.php` (DSN).
- **Données** : `BDD/Projet_BDD.sql` (tables `User`, `Role`, `Materiel`, `Categorie`, `Emprunt`, `Rendu`, `Notification`, `Prolongation`). Créations lazy : `MaintenanceRequest`, `ReservationRequest`, colonne `User.LastLogin`, colonne `Materiel.Image`.

</details>

<details open>
<summary><strong>📌 Règles métier essentielles</strong></summary>

- Rôles : `Eleve` (utilisateur), `Professeur` (réservation jusqu’à 3 semaines, secret `prof`), `Technicien` (maintenance uniquement, secret `tech`), `Administrateur` (secret `admin`).
- Réservation : pas de passé, durée max 14 jours (21 jours pour professeur), dates bloquées si déjà réservées/maintenance.
- Prolongation : demande utilisateur, validation admin obligatoire, limite de durée selon le rôle et sans chevauchement avec une autre réservation/maintenance.
- Statuts prêt : `En cours`, `Annulation demandee`, `Maintenance`, `Maintenance terminee`, `Terminé`.
- Etats matériel : `neuf`, `bon`, `passable`, `reparation nécessaire` (on ne peut pas améliorer l’état au retour).
- `Materiel.Dispo` passe à “Non” dès qu’une réservation couvre aujourd’hui ; “Oui” quand plus aucun prêt actif.
- Blocage retards : si un élève/professeur cumule 3 retards (prêts rendus en retard ou en retard non rendus), toute nouvelle réservation passe en demande `pending` pour validation administrateur.
- Actions <span style="color:#d9534f;font-weight:600;">admin uniquement</span> : création/suppression matériel, rendus/annulations directes, stats globales, comptes. Maintenance : administrateur ou technicien ; si une maintenance technicien chevauche des réservations, elle part en demande “en attente” pour validation admin (sans suppression tant que non validée).
- Annulations par admin ou maintenance : l’utilisateur concerné reçoit une notification (bannière) au prochain chargement de l’application.

</details>

<details open>
<summary><strong>🔄 Flux principaux</strong></summary>

1) **Auth** (`assets/login.js`) : login/register, choix rôle + mot secret prof/tech/admin, ripple, redirection (`POST /api/auth.php?action=login|register|logout`).
2) **Catalogue** (`assets/app.js`) : recherche + tags, modale calendrier, réservation (`POST /api/equipment.php?action=reserve`), contrôle dates libres, durée max selon rôle.
3) **Annulations** : user demande (`POST /api/dashboard.php?action=cancel_request`), admin valide ou supprime (`POST /api/dashboard.php?action=admin_cancel`) ; les annulations admin/maintenance génèrent une notification livrée à l'utilisateur.
4) **Prolongation** : user demande depuis sa liste d'emprunts (`POST /api/dashboard.php?action=extend_request`), l'admin valide ou refuse (`POST /api/dashboard.php?action=extend_decide`) après contrôle de conflits et durée (role-based).
5) **Rendus** (admin) : liste prêts en cours, état borné, rendu (`POST /api/dashboard.php?action=return`), maj dispo + rendu enregistré.
6) **Maintenance** (admin/technicien) : planif multi-jours (`POST /api/equipment.php?action=maintenance`). Si un technicien chevauche des réservations, une demande est créée (`MaintenanceRequest`) et visible dans l’onglet maintenance ; un admin la valide ou la refuse via `POST /api/equipment.php?action=maintenance_decide`. La validation écourte les réservations chevauchées (fin la veille du début de maintenance) quand c’est possible ou les annule si elles démarrent pendant la maintenance, avec notification utilisateur ; la clôture de maintenance reste possible par admin/technicien.
7) **Stats** : user (`/api/dashboard.php` scope mine) et admin (`/api/dashboard.php?action=admin_stats`), historiques filtrables.

</details>

<details open>
<summary><strong>🧱 Guide de code (survol)</strong></summary>

- **assets/app.js** : point d’entrée, branche les listeners, charge session + données, orchestre modale/réservation/maintenance.
- **assets/app/api.js** : appels fetch et normalisation des réponses dans le state.
- **assets/app/render.js** : rendu UI (catalogue, prêts, maintenance, comptes, stats) + export PDF.
- **assets/app/calendar.js** : sélection des dates, blocage périodes, logique de modale.
- **assets/app/ui.js** : indicateur d’onglets, reveal, visibilité selon rôle.
- **assets/app/utils.js** : helpers de format/normalisation (dates, catégories, états, placeholders).
- **assets/app/state.js** / **assets/app/dom.js** / **assets/app/config.js** / **assets/app/permissions.js** : état, cache DOM, endpoints, règles de rôles.
- **assets/login.js** : bascule login/register, bouton œil, loader ripple, `apiLogin`/`apiRegister`.
- **api/auth.php** : sessions, rôles, LastLogin, CRUD users (admin).
- **api/equipment.php** : catalogue + périodes actives, réservations (refus passé/conflits), maintenance (ajustements + demandes), CRUD matériel (admin).
- **api/dashboard.php** : prêts + historique, rendus (contrôle état et dispo), annulations user/admin, stats retards/dégradations/maintenances.
- **api/install.php** / **api/reset_state.php** : initialisation via dump SQL et reset démo.

</details>

## 🔍 Détail des principales fonctions (logique interne)
- **Frontend (`assets/app.js`)**
  - Boot: charge session + données, applique les règles de rôle, branche les listeners (tabs, recherches, admin form).
  - Modale: orchestre la réservation/maintenance et déclenche les appels API + rendu.
- **Frontend (`assets/app/api.js`)**
  - `apiSession`, `apiFetchEquipment`, `apiFetchLoans`, `apiFetchAdminLoans`, `apiFetchAdminStats` : lectures API + normalisation.
  - `apiFetchUsers`, `apiSetUserRole`, `apiDeleteUser` : gestion des comptes.
  - `apiReturnLoan`, `apiAdminCancelLoan`, `apiRequestCancel`, `apiRequestExtension`, `apiDecideExtension`, `apiDecideReservationRequest`.
  - `apiCreateEquipment`, `apiDeleteEquipment`, `apiSetMaintenance`, `apiDecideMaintenance`, `apiLogout`.
- **Frontend (`assets/app/render.js`)**
  - `renderApp` : orchestre notifications, tags, catalogues, prêts, stats.
  - `renderCatalog`, `renderLoans`, `renderAdminLoans`, `renderMaintenanceCatalog`, `renderMaintenanceAgenda`, `renderAccounts`.
  - `renderStats`, `renderUserStatsList`, `renderAdminStats`, `renderAdminStatsList`.
  - `exportInventoryPdf` : ouvre une fenêtre d’impression dédiée.
- **Frontend (`assets/app/calendar.js`)**
  - `openModal`, `openExtendModal`, `closeModal` : gestion de la modale.
  - `renderCalendar`, `handleDayClick`, `selectionRange`, `isRangeFree`.
  - `buildBlockedDates`, `datesBetween`, `updateAvailabilityMessage`, `nextAvailableDate`.
- **Frontend (`assets/app/ui.js` / `assets/app/utils.js`)**
  - UI: `applyRoleVisibility`, `updateTabs`, `setupTabIndicatorResize`, `revealInContainer`, `setAuthUI`.
  - Utils: `formatDisplayDate`, `formatDateLocal`, `canonicalCategory`, `needsRepair`, `placeholderImage`, `normalizeCondition`, `conditionRank`, `allowedReturnConditions`, `dueSeverity`.
- **Frontend (`assets/login.js`)**
  - `fitLoaderLabel`, `ensureAuthLoader`, `initPasswordToggles`, `playRippleAndRedirect`.
  - `updateSecretVisibility`, `switchMode`, `apiLogin`, `apiRegister`.
- **Backend Auth (`api/auth.php`)**
  - `login` : récupère user par email ou login, vérifie hash ou clair (dump initial), met à jour `LastLogin`, stocke l’id/role en session.
  - `register` : valide email/mots de passe, rôle prof/tech/admin protégé par secret, crée l’utilisateur et ouvre la session.
  - `set_role` / `delete_user` : sécurisées admin, empêchent de retirer/supprimer un admin existant par erreur.
- **Backend Catalogue/Reservations (`api/equipment.php`)**
  - `list_equipment` : jointure matériel + catégories, périodes actives, tags, réservations/maintenance.
  - `reserve_equipment` : valide dates + conflits, refuse le passé, crée une `ReservationRequest` si 3+ retards (hors admin/tech).
  - `set_maintenance` : technicien → demande pending si chevauchement ; admin → raccourcit/annule les réservations chevauchantes et notifie.
  - `decide_maintenance_request` : admin valide/refuse une demande, applique les mêmes ajustements.
  - `create_equipment` / `delete_equipment` : CRUD admin, upload image, renvoi item pour rafraîchir l’UI.
- **Backend Emprunts/Stats (`api/dashboard.php`)**
  - `fetch_loans` : renvoie les emprunts (user ou globaux), conserve matériel supprimé, calcule progression/type.
  - `return_pret` : contrôle accès, empêche double rendu, borne l’état, met `Dispo`, insère le rendu (flag dégradation).
  - `request_cancel` / `admin_cancel` : annulation user/admin + notifications.
  - `request_extension` / `decide_extension` : demandes de prolongation + validation admin.
  - `decide_reservation_request` : admin valide/refuse une `ReservationRequest` après contrôles.
  - `build_stats` / `build_admin_stats` : retards, dégradations, maintenances, historiques.
- **Backend utilitaires**
  - `api/install.php` : import idempotent du dump SQL.
  - `api/reset_state.php` : remet l’état démo (dispo, emprunts, rendus).
  - `api/db.php` : connexion PDO centralisée via `api/config.php`.

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
5. Comptes de test (dump) : admin `admin/admin`, user `testtruc/1234`. Secrets de création : prof=`prof`, technicien=`tech`, admin=`admin`.

## Dépannage
- **401/403** : session expirée ou rôle insuffisant (admin requis). Reconnexion ou vérifier cookies.
- **Conflit de dates** : vérifiez que la plage n’est ni passée ni déjà bloquée et qu’elle dure ≤ 14 jours.
- **Connexion BD** : valider DSN/identifiants dans `api/config.php`, privilégier `127.0.0.1` si le socket est restreint.
- **Reset démo** : `POST /api/reset_state.php` pour vider emprunts/rendus et remettre tout disponible.

## Tests rapides manuels
- Auth : connexion et création d’un compte test.
- Réservation : sélectionner une plage future (<=14j ou 21j pour un professeur), vérifier grisé des dates passées.
- Annulation : demander une annulation côté user, valider côté admin.
- Retour : marquer un prêt comme rendu en changeant l’état (ne pas pouvoir améliorer l’état initial).
- Maintenance : technicien planifie une maintenance qui chevauche une réservation → doit apparaître “en attente” ; en admin, valider la demande, vérifier la suppression des réservations impactées et la notification.
- Notification : annuler une réservation côté admin ou via maintenance, se reconnecter en user et vérifier la bannière d’alerte.
