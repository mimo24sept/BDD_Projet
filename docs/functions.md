# Documentation des fonctions (vue d'ensemble)

Cette page décrit la logique interne des principales fonctions front et back. Objectif : savoir rapidement ce que fait chaque fonction et dans quel ordre, sans lire tout le code.

## Frontend

### assets/login.js
- `initPasswordToggles` : parcourt chaque champ `.password-field`, récupère l’input + bouton, et toggle `type=password/text` avec les attributs aria quand on clique.
- `playRippleAndRedirect` : si l’overlay ripple existe, ajoute la classe `show`, joue l’animation des cercles, puis redirige vers `menu.html` après un délai ; sinon redirection immédiate.
- `updateSecretVisibility` : montre/cache la ligne “mot secret” selon la valeur du select rôle ; vide le champ si caché.
- `switchMode(mode)` : bascule l’affichage entre bloc login et bloc register (hidden/display), nettoie les messages, appelle `updateSecretVisibility`.
- `apiLogin(payload)` / `apiRegister(payload)` : POST JSON vers `api/auth.php` (actions `login` ou `register`), parse le JSON, lève une erreur si statut HTTP != 200.

### assets/app.js — API et état
- `apiSession` : GET `api/auth.php`, met `state.user` selon la réponse ou null si échec.
- `apiFetchEquipment` : GET catalogue, normalise catégories/tags, ordonne les réservations par date de début, injecte placeholders et descriptions synthétiques.
- `apiFetchLoans` : GET `api/dashboard.php`, garde les prêts non rendus, construit l’historique via `normalizeHistory`, stocke stats et messages d’erreur éventuels.
- `apiFetchAdminLoans` : GET `api/dashboard.php?scope=all`, remplit `state.adminLoans`.
- `apiFetchAdminStats` : GET `api/dashboard.php?action=admin_stats` (si admin), peuple `state.adminStats` + `state.adminHistory`, gère les erreurs.
- `apiFetchUsers` / `apiSetUserRole` / `apiDeleteUser` : CRUD minimal sur les comptes via `api/auth.php`.
- `apiReturnLoan` : POST `dashboard?action=return` avec `id` et `condition`, lève en cas d’erreur, rafraîchit les prêts.
- `apiAdminCancelLoan` : POST `dashboard?action=admin_cancel`, rafraîchit les prêts.
- `apiRequestCancel` : POST `dashboard?action=cancel_request`, rafraîchit les prêts.
- `apiLogout` : POST `auth?action=logout` (best-effort).
- `apiCreateEquipment` / `apiDeleteEquipment` / `apiSetMaintenance` : POST sur `api/equipment.php` pour créer/supprimer/planifier maintenance ; lèvent en cas d’erreur HTTP.

### assets/app.js — helpers et rendu
- `setAuthUI` / `isAdmin` / `applyRoleVisibility` : mettent à jour la puce utilisateur et affichent/masquent les onglets et sections selon le rôle.
- `render` : orchestrateur qui appelle les sous-rendus (tabs, tags, catalogues, prêts, stats).
- `updateTabs` : active l’onglet courant et montre la section associée, cache les autres.
- `renderTags` / `renderAdminTags` / `renderMaintenanceTags` : agrègent les tags depuis l’inventaire, créent des chips cliquables pour filtrer, ajoutent un bouton “Tous”.
- `renderAdminCatalog` / `renderMaintenanceCatalog` / `renderCatalog` : appliquent recherche + tag + tri, construisent les cartes (état, dispo, description), ajoutent un bouton “Tout afficher”.
- `renderMaintenanceAgenda` : liste les maintenances actives (type maintenance), calcule sévérité sur date de fin ou début, ajoute bouton “Fin de maintenance”.
- `renderAccounts` : liste des comptes admin (login, email, rôle) avec boutons set role/delete.
- `renderLoans` : côté user, trie les prêts par sévérité/date, affiche badge d’état, progression, boutons “Rendre” (admin) ou “Demander annulation” (user, si non commencé).
- `renderAdminLoans` : split en deux colonnes : gauche “Réservations en cours” (retours/états), droite “Annulations à traiter” puis “Réservations à venir” (annulables). Construit boutons (rendre/annuler) et sélecteurs d’état si applicable.
- `renderStats` / `renderUserStatsList` : cartes et liste de l’historique filtrée (retards/dégradations) pour l’utilisateur.
- `renderAdminStats` / `renderAdminStatsList` : cartes et historique filtrable (retards/dégradations/maintenances) côté admin.
- `normalizeCondition` / `conditionRank` / `allowedReturnConditions` / `formatConditionLabel` / `buildReturnOptions` : normalisent un état, lui attribuent un rang, et génèrent les options du select de retour en empêchant d’améliorer l’état initial.
- `openModal` / `closeModal` : ouvrent/ferment la modale de réservation/maintenance, initialisent les dates et le calendrier, placent le bouton et les titres selon le mode.
- `statusBadge` / `escapeHtml` / `formatDisplayDate` / `formatDateLocal` : utilitaires de rendu texte/badges/dates.
- `canonicalCategory` / `needsRepair` / `placeholderImage` : helpers pour normaliser une catégorie, déterminer si l’état est faible, et générer une image fallback.
- Calendrier et dates :
  - `isoWeekKey`, `weeksBetween` : calcul de clés de semaine ISO pour bloquer des périodes.
  - `buildBlockedDates` : mappe chaque date occupée par prêt/maintenance en marquant la maintenance prioritaire.
  - `isRangeFree` : vérifie qu’aucune date de la plage n’est bloquée (sauf override maintenance).
  - `datesBetween` : liste toutes les dates incluses d’une plage.
  - `renderCalendar` : construit la grille du mois courant, bloque passé et dates occupées, gère navigation mois précédent/suivant.
  - `handleDayClick` : gère la sélection début/fin (max 14 jours, pas dans le passé, rejette plage occupée).
  - `selectionRange`, `isDateSelected`, `isDateInSelection`, `dateDiffDays`, `nextAvailableDate`, `weekStartFromDate`, `addDays`, `parseManualInput`, `formatManualInput`, `handleManualDateInput`, `syncManualInputs`, `updateAvailabilityMessage` : composent la logique de sélection et de validation des dates (bornage passé/14j, messages modale).
  - `dueSeverity` / `severityColor` / `severityLabel` : définissent la sévérité (retard/urgent/bientôt) selon la date de fin.

## Backend

### api/auth.php
- `login` : lit JSON login/mdp, cherche l’utilisateur par email ou login, vérifie hash ou clair, met `LastLogin` si possible, crée la session (id/login/role), renvoie l’utilisateur courant.
- `logout` : vide la session et renvoie un message JSON.
- `register` : valide email/mots de passe, rôle professeur avec secret front, vérifie doublon email/login, insère l’utilisateur avec rôle associé, ouvre la session.
- `current_user` : renvoie l’utilisateur en session (id/login/role) ou null.
- `is_valid_password` : accepte hash ou mot de passe en clair (dump).
- `lookup_role_id` : retrouve l’ID d’un rôle ou fallback.
- `list_users` : liste des comptes (hors admins) avec colonne `LastLogin` si disponible.
- `normalize_role` : mappe un libellé vers `Administrateur` ou `Utilisateur`.
- `set_role` : admin-only, met à jour le rôle, refuse de retirer un rôle admin à un administrateur existant.
- `delete_user` : admin-only, refuse de supprimer un admin, supprime le compte sinon.
- `fetch_user_with_role` : récupère un user + rôle par ID.
- `is_role_admin` / `is_admin` : helpers de rôle.
- `ensure_last_login_column` : tente d’ajouter la colonne `LastLogin` si absente.

### api/equipment.php
- `list_equipment` : jointure matériel + catégorie, ajoute les périodes de réservations/maintenance actives par matériel, tags dérivés, clé de semaines réservées.
- `reserve_equipment` : vérifie ID, dates valides/ordonnées, conflit d’emprunt actif, refus du passé ; si la période couvre aujourd’hui, passe `Dispo` à “Non”, puis insère l’emprunt.
- `set_maintenance` : vérifie ID/dates, supprime les emprunts chevauchant la maintenance (hors maintenances existantes), passe l’équipement en “Non” si la période inclut aujourd’hui, insère un emprunt de type maintenance.
- `create_equipment` : admin, crée un matériel, génère une référence, renvoie l’item créé.
- `delete_equipment` : admin, supprime un matériel et renvoie un statut.
- `fetch_active_loans` : agrège par matériel les périodes actives (emprunts non rendus) et maintenances en cours pour bloquer le calendrier.
- `fetch_equipment_by_id` : renvoie un matériel et ses périodes (y compris maintenance).
- `map_status` / `merge_tags` / `normalize_categories` / `generate_reference` / `build_reference_prefix` / `transliterate_to_ascii` / `weeks_between` / `period_is_current` / `iso_week_key` / `is_admin` : helpers de statut, tags, références, semaines, rôle admin.

### api/dashboard.php
- `fetch_loans` : renvoie les emprunts (utilisateur ou globaux si admin), garde ceux dont le matériel est supprimé (nom de fallback), calcule progression et type.
- `compute_start_date` : calcule un début par défaut (J-7) si seul `DATEfin` existe.
- `progress_percent` : ratio temps écoulé vs durée totale.
- `build_stats` : sur les prêts non maintenance, calcule retards (due < aujourd’hui ou rendu après due), dégradations (`is_degradation`), totaux année courante, construit l’historique trié.
- `build_admin_stats` : agrège retards/dégradations/maintenances sur l’année en cours pour l’admin, génère historique avec utilisateur et état de retour.
- `return_pret` : admin-only, vérifie l’accès, empêche double rendu, borne l’état retourné (pas mieux que l’état initial), met `Materiel.Dispo` à “Oui” s’il n’y a plus d’emprunt actif sur la période, insère un rendu avec flag dégradation si état dégradé.
- `request_cancel` : utilisateur/admin, vérifie l’accès et l’absence de rendu, marque l’emprunt `Annulation demandee`.
- `admin_cancel` : admin, supprime l’emprunt non rendu, remet `Materiel.Dispo` à “Oui” s’il n’y a plus de prêt actif couvrant aujourd’hui.
- Helpers : `normalize_condition`, `condition_rank`, `is_degradation`, `is_admin`.
