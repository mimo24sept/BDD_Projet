# Documentation des fonctions

---

## 🎨 Frontend

<details>
<summary><strong>assets/login.js (auth & UI)</strong></summary>

| Fonction | Logique rapide |
| --- | --- |
| `initPasswordToggles` | Parcourt les champs mot de passe, branche le bouton œil (toggle `type` + aria). |
| `playRippleAndRedirect` | Lance l’animation ripple si dispo puis redirige vers `menu.html` (sinon redirection directe). |
| `updateSecretVisibility` | Affiche/masque le champ “mot secret” selon le rôle sélectionné (professeur). |
| `switchMode` | Bascule entre formulaires login/register, rafraîchit l’UI et les messages. |
| `apiLogin` / `apiRegister` | POST JSON vers `api/auth.php`, parse la réponse, lève en cas d’erreur HTTP. |

</details>

<details>
<summary><strong>assets/app.js — API & état</strong></summary>

- `apiSession` : GET session, met `state.user` ou null.
- `apiFetchEquipment` : charge le catalogue, normalise catégories/tags, ordonne les réservations, ajoute placeholders/description.
- `apiFetchLoans` : récupère prêts + stats + notifications non lues (annulations admin/maintenance), filtres, construit l’historique via `normalizeHistory`, récupère aussi les demandes de maintenance et de réservation.
- `apiFetchAdminLoans` / `apiFetchAdminStats` : emprunts globaux et stats admin (si admin), remonte aussi les demandes de maintenance et de réservation.
- `apiFetchUsers`, `apiSetUserRole`, `apiDeleteUser` : comptes via `api/auth.php`.
- `apiReturnLoan`, `apiAdminCancelLoan`, `apiRequestCancel`, `apiRequestExtension`, `apiDecideExtension`, `apiDecideReservationRequest` : actions retour/annulation/prolongation/validation réservations, puis rafraîchissement.
- `apiCreateEquipment`, `apiDeleteEquipment`, `apiSetMaintenance`, `apiDecideMaintenance` : CRUD/maintenance matériel, demandes de maintenance et validation admin, lèvent si erreur HTTP.

</details>

<details>
<summary><strong>assets/app.js — rendu & helpers</strong></summary>

- `setAuthUI` / `isAdmin` / `applyRoleVisibility` : UI selon rôle/session.
- `render` : orchestrateur des sous-rendus (tabs, tags, catalogues, prêts, stats).
- `updateTabs` : active l’onglet courant, cache les autres sections.
- `renderNotifications` : affiche les alertes d’annulation en bannière (notifications non lues).
- Tags : `renderTags`, `renderAdminTags`, `renderMaintenanceTags` (chips filtrants + “Tous”).
- Catalogues : `renderAdminCatalog`, `renderMaintenanceCatalog`, `renderCatalog` (recherche, tags, tri, cartes).
- Maintenance : `renderMaintenanceAgenda` (liste, sévérité, bouton fin de maintenance, bloc des demandes “en attente” avec boutons valider/refuser côté admin).
- Comptes : `renderAccounts` (login/email/rôle + actions).
- Prêts user : `renderLoans` (tri sévérité/date, progression, actions rendre/annuler/prolonger).
- Prêts admin : `renderAdminLoans` (2 colonnes : en cours vs annulations/résas à venir + bulles pour validations de réservations et demandes de prolongation).
- Stats user/admin : `renderStats`, `renderUserStatsList`, `renderAdminStats`, `renderAdminStatsList`.
- Etats matériel : `normalizeCondition`, `conditionRank`, `allowedReturnConditions`, `formatConditionLabel`, `buildReturnOptions`.
- Modale/réservation : `openModal`, `closeModal`, `statusBadge`, `escapeHtml`, `formatDisplayDate`, `formatDateLocal`, `canonicalCategory`, `needsRepair`, `placeholderImage`.
- Calendrier/dates : `isoWeekKey`, `weeksBetween`, `buildBlockedDates`, `isRangeFree`, `datesBetween`, `renderCalendar`, `handleDayClick`, `selectionRange`, `isDateSelected`, `isDateInSelection`, `dateDiffDays`, `nextAvailableDate`, `weekStartFromDate`, `addDays`, `parseManualInput`, `formatManualInput`, `handleManualDateInput`, `syncManualInputs`, `updateAvailabilityMessage`.
- Sévérité : `dueSeverity`, `severityColor`, `severityLabel`.

</details>

---

## 🛠️ Backend

<details>
<summary><strong>api/auth.php</strong></summary>

| Fonction | Logique |
| --- | --- |
| `login` | Lit JSON login/mdp, cherche par email/login, vérifie hash ou clair, met `LastLogin`, crée session (id/login/role). |
| `logout` | Vide la session, message JSON. |
| `register` | Valide email/mdp, protège rôle prof (mot secret), vérifie doublons, insère user, ouvre session. |
| `current_user` | Renvoie user en session ou null. |
| `is_valid_password` | Accepte hash ou clair (dump). |
| `lookup_role_id`, `list_users`, `normalize_role`, `set_role`, `delete_user`, `fetch_user_with_role`, `is_role_admin`, `is_admin`, `ensure_last_login_column` | Helpers rôles/colonnes, CRUD users admin-only, protections admin. |

</details>

<details>
<summary><strong>api/equipment.php</strong></summary>

| Fonction | Logique |
| --- | --- |
| `list_equipment` | Jointure matériel/catégorie, périodes actives (prêt/maintenance), tags, semaines bloquées. |
| `reserve_equipment` | Vérifie ID, dates valides/ordonnées, conflit actif, refuse le passé, bloque dispo si période courante, insère emprunt ; si ≥3 retards (hors admin/tech) → crée une `ReservationRequest` “pending”. |
| `set_maintenance` | Vérifie ID/dates, (admin ou technicien) : si chevauchement et technicien → enregistre une `MaintenanceRequest` “pending”; côté admin, supprime les emprunts chevauchants en notifiant les utilisateurs impactés, bloque dispo si période courante, insère l’emprunt maintenance. |
| `set_maintenance` | Vérifie ID/dates, (admin ou technicien) : si chevauchement et technicien → enregistre une `MaintenanceRequest` “pending”; côté admin, écourte les réservations chevauchées (fin la veille de la maintenance quand c’est possible, annule sinon) avec notification, bloque dispo si période courante, insère l’emprunt maintenance. |
| `decide_maintenance_request` | Admin : approuve/refuse une `MaintenanceRequest`, applique le même raccourcissement/annulation sur les réservations impactées et notifie les utilisateurs, insère l’emprunt maintenance. |
| `create_equipment` / `delete_equipment` | CRUD admin, génère référence, renvoie item/statut. |
| Helpers | `fetch_active_loans`, `fetch_equipment_by_id`, `map_status`, `merge_tags`, `normalize_categories`, `generate_reference`, `build_reference_prefix`, `transliterate_to_ascii`, `weeks_between`, `period_is_current`, `iso_week_key`, `adjust_overlapping_reservations`, `count_user_delays`, `ensure_maintenance_request_table`, `ensure_reservation_request_table`, `is_admin`. |

</details>

<details>
<summary><strong>api/dashboard.php</strong></summary>

| Fonction | Logique |
| --- | --- |
| `fetch_loans` | Emprunts (user ou globaux si admin), garde matériel supprimé, calcule progression/type. |
| `compute_start_date` | Début par défaut (J-7) si seule la fin existe. |
| `progress_percent` | Ratio temps écoulé / durée totale. |
| `build_stats` | (hors maintenance) retards (due < aujourd’hui ou rendu tardif), dégradations, totaux annuels, historique trié. |
| `build_admin_stats` | Retards/dégradations/maintenances de l’année, historique avec user + état de retour. |
| `request_extension` / `decide_extension` | Crée une demande de prolongation côté user, puis validation/refus admin (contrôle durée max selon rôle, conflits, notification user). |
| `return_pret` | Admin-only (technicien autorisé pour les maintenances) : contrôle accès, empêche double rendu, borne l’état, remet `Dispo` si plus d’emprunt actif, insère rendu (flag dégradation). |
| `request_cancel` | User/admin : vérifie accès + non-rendu, marque `Annulation demandee`. |
| `admin_cancel` | Admin : supprime l’emprunt non rendu, notifie l’utilisateur, remet `Dispo` si aucune autre résa active aujourd’hui. |
| `enqueue_notification` / `consume_notifications` | Stocke les notifications en base (annulation admin/maintenance) et renvoie les non lues en les marquant comme vues. |
| `fetch_maintenance_requests` / `fetch_reservation_requests` | Liste les demandes “pending” (maintenance ou réservation) global admin ou filtrées par demandeur. |
| `decide_reservation_request` | Admin : valide/refuse une `ReservationRequest`, re-vérifie conflit/durée/validité, crée l’emprunt et notifie l’utilisateur. |
| `ensure_prolongation_table` / `ensure_maintenance_request_table` / `ensure_reservation_request_table` | Création lazy des tables `Prolongation`, `MaintenanceRequest` et `ReservationRequest`. |
| Helpers | `normalize_condition`, `condition_rank`, `is_degradation`, `is_admin`. |

</details>
