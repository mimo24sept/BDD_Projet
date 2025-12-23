# Documentation des fonctions

---

## 🎨 Frontend

<details>
<summary><strong>assets/login.js (auth & UI)</strong></summary>

| Fonction | Logique rapide |
| --- | --- |
| `fitLoaderLabel` | Ajuste la taille du texte GEII pour remplir la barre du loader. |
| `ensureAuthLoader` | Injecte le loader au besoin et installe un resize unique. |
| `initPasswordToggles` | Parcourt les champs mot de passe, branche le bouton œil (toggle `type` + aria). |
| `playRippleAndRedirect` | Lance l’animation ripple si dispo puis redirige vers `menu.html` (sinon redirection directe). |
| `updateSecretVisibility` | Affiche/masque le champ “mot secret” selon le rôle (prof/tech/admin). |
| `switchMode` | Bascule entre formulaires login/register, rafraîchit l’UI et les messages. |
| `apiLogin` / `apiRegister` | POST JSON vers `api/auth.php`, parse la réponse, lève en cas d’erreur HTTP. |

</details>

<details>
<summary><strong>assets/app.js (bootstrap & événements)</strong></summary>

- Branche les listeners (onglets, recherches, admin form, modale).
- Charge session + données, applique les règles de rôle, déclenche `renderApp`.
- Orchestre les actions de réservation/maintenance avec appels API puis re-render.

</details>

<details>
<summary><strong>assets/app/api.js (appels API)</strong></summary>

- `apiSession`, `apiFetchEquipment`, `apiFetchLoans`, `apiFetchAdminLoans`, `apiFetchAdminStats`.
- `apiFetchUsers`, `apiSetUserRole`, `apiDeleteUser`.
- `apiReturnLoan`, `apiAdminCancelLoan`, `apiRequestCancel`, `apiRequestExtension`, `apiDecideExtension`, `apiDecideReservationRequest`.
- `apiCreateEquipment`, `apiDeleteEquipment`, `apiSetMaintenance`, `apiDecideMaintenance`, `apiLogout`.

</details>

<details>
<summary><strong>assets/app/render.js (rendu UI)</strong></summary>

- `renderApp`, `renderNotifications`, `renderTags`, `renderAdminTags`, `renderMaintenanceTags`.
- `renderCatalog`, `renderAdminCatalog`, `renderMaintenanceCatalog`.
- `renderLoans`, `renderAdminLoans`, `renderMaintenanceAgenda`, `renderAccounts`.
- `renderStats`, `renderUserStatsList`, `renderAdminStats`, `renderAdminStatsList`.
- `exportInventoryPdf` (fenêtre d’impression dédiée).

</details>

<details>
<summary><strong>assets/app/calendar.js (calendrier & modale)</strong></summary>

- `openModal`, `openExtendModal`, `closeModal`, `getModalMode`, `getExtensionContext`, `getBlockedDates`.
- `renderCalendar`, `handleDayClick`, `selectionRange`, `isRangeFree`.
- `buildBlockedDates`, `datesBetween`, `updateAvailabilityMessage`, `nextAvailableDate`.

</details>

<details>
<summary><strong>assets/app/ui.js (UI/onglets)</strong></summary>

- `setAuthUI`, `applyRoleVisibility`, `updateTabs`.
- `setupTabIndicatorResize`, `revealInContainer`.

</details>

<details>
<summary><strong>assets/app/utils.js (helpers)</strong></summary>

- Dates & format : `formatDisplayDate`, `formatDateLocal`, `isoWeekKey`, `weeksBetween`, `datesBetween`.
- Catégories & états : `canonicalCategory`, `normalizeCondition`, `conditionRank`, `allowedReturnConditions`, `formatConditionLabel`.
- UI : `placeholderImage`, `escapeHtml`, `statusBadge`, `dueSeverity`.

</details>

<details>
<summary><strong>assets/app/state.js / dom.js / permissions.js / config.js</strong></summary>

- `state` : source unique de l’état front.
- `dom` : cache des nœuds DOM.
- `permissions` : helpers `isAdmin`, `isTechnician`, `isProfessor`, `hasMaintenanceAccess`, `maxReservationDays`, `canViewAdminStats`.
- `config` : endpoints API + tags + rangs d’état.

</details>

---

## 🛠️ Backend

<details>
<summary><strong>api/auth.php</strong></summary>

| Fonction | Logique |
| --- | --- |
| `login` | Lit JSON login/mdp, cherche par email/login, vérifie hash ou clair, met `LastLogin`, crée la session. |
| `logout` | Vide la session, renvoie un JSON de confirmation. |
| `register` | Valide email/mdp, protège rôles prof/tech/admin via secret, crée l’utilisateur et ouvre la session. |
| `current_user` | Renvoie l’utilisateur en session ou null. |
| `is_valid_password` | Accepte hash ou clair (dump). |
| `lookup_role_id`, `list_users`, `normalize_role`, `set_role`, `delete_user`, `fetch_user_with_role`, `is_role_admin`, `is_admin`, `ensure_last_login_column` | Helpers rôles/colonnes, CRUD users admin-only, protections admin. |

</details>

<details>
<summary><strong>api/equipment.php</strong></summary>

| Fonction | Logique |
| --- | --- |
| `list_equipment` | Jointure matériel/catégorie, périodes actives (prêt/maintenance), tags, semaines bloquées. |
| `reserve_equipment` | Vérifie ID/dates/conflits, refuse le passé, bloque dispo si période courante ; si ≥3 retards (hors admin/tech) → `ReservationRequest` “pending”. |
| `set_maintenance` | Admin : raccourcit/annule les réservations chevauchantes + notifie ; technicien : demande “pending” si chevauchement. |
| `decide_maintenance_request` | Admin : approuve/refuse une `MaintenanceRequest`, applique les mêmes ajustements + notifications. |
| `create_equipment` / `delete_equipment` | CRUD admin, gère l’image optionnelle, renvoie item/statut. |
| Helpers | `fetch_active_loans`, `fetch_equipment_by_id`, `map_status`, `merge_tags`, `normalize_categories`, `generate_reference`, `build_reference_prefix`, `transliterate_to_ascii`, `weeks_between`, `period_is_current`, `iso_week_key`, `adjust_overlapping_reservations`, `count_user_delays`, `ensure_maintenance_request_table`, `ensure_reservation_request_table`, `ensure_material_picture_column`, `store_uploaded_picture`, `is_admin`. |

</details>

<details>
<summary><strong>api/dashboard.php</strong></summary>

| Fonction | Logique |
| --- | --- |
| `fetch_loans` | Emprunts (user ou globaux si admin), garde matériel supprimé, calcule progression/type. |
| `compute_start_date` | Début par défaut (J-7) si seule la fin existe. |
| `progress_percent` | Ratio temps écoulé / durée totale. |
| `build_stats` | (hors maintenance) retards, dégradations, totaux annuels, historique trié. |
| `build_admin_stats` | Retards/dégradations/maintenances de l’année, historique avec user + état de retour. |
| `request_extension` / `decide_extension` | Crée une demande de prolongation côté user, puis validation/refus admin (contrôle durée max, conflits, notification). |
| `return_pret` | Admin/technicien : contrôle accès, empêche double rendu, borne l’état, remet `Dispo`, insère rendu (flag dégradation). |
| `request_cancel` | User/admin : vérifie accès + non-rendu, marque `Annulation demandee`. |
| `admin_cancel` | Admin : supprime l’emprunt non rendu, notifie l’utilisateur, remet `Dispo` si aucune autre résa active aujourd’hui. |
| `enqueue_notification` / `consume_notifications` | Stocke les notifications en base et renvoie les non lues. |
| `fetch_maintenance_requests` / `fetch_reservation_requests` | Liste les demandes “pending” (maintenance ou réservation). |
| `decide_reservation_request` | Admin : valide/refuse une `ReservationRequest`, re-vérifie conflit/durée/validité. |
| `ensure_prolongation_table` / `ensure_maintenance_request_table` / `ensure_reservation_request_table` | Création lazy des tables associées. |
| Helpers | `normalize_condition`, `condition_rank`, `is_degradation`, `is_admin`. |

</details>

<details>
<summary><strong>api/install.php / api/reset_state.php / api/db.php</strong></summary>

- `api/install.php` : import idempotent du dump SQL (si tables absentes).
- `api/reset_state.php` : reset démo (dispo matériel + suppression emprunts/rendus), admin-only.
- `api/db.php` : connexion PDO centralisée via `api/config.php`.

</details>
